var path = require('path');
var fs = require('fs');
var Q = require('q');
var multistream = require('multistream');
var Enumerable = require('linq');
var Utils = require('./utils');
var LogType = require('./types/log-type');
var Logger = require('./logger');
var Constants = require('./constants');
var RuleType = require('./types/rule-type');
var SourceRule = require('./rules/source-rule');
var FilterRule = require('./rules/filter-rule');
var RenameRule = require('./rules/rename-rule');
var ReplaceContentRule = require('./rules/replace-content-rule');
var MoveRule = require('./rules/move-rule');
var Export = require('./export');
/**
 * Execution context
 */
var ExecutionContext = (function () {
    function ExecutionContext() {
    }
    /**
     * Initialization
     */
    ExecutionContext.prototype.initialize = function (transform, file, encoding) {
        var _this = this;
        Logger.log(LogType.Information, 'Reading bower.json contents...');
        return Utils.streamToBuffer(file.contents)
            .then(function (buffer) { return Utils.parseJson(buffer); })
            .then(function (bowerJson) {
            // Check if .bowerrc exists in the bower.json location
            var bowerRcPath = path.join(path.dirname(file.path), '.bowerrc');
            bowerRcPath = path.resolve(process.cwd(), bowerRcPath);
            return Utils.readJson(bowerRcPath)
                .then(function (rc) { return Utils.fileOrDirectoryExists(path.join(path.dirname(file.path), rc.directory)); })
                .then(function (bowerCompsDir) { return Utils.resolvedPromise({ dir: path.relative(process.cwd(), bowerCompsDir), json: bowerJson }); })
                .catch(function (e) {
                Logger.log(LogType.Warning, '.bowerrc file does not exist or could not be read');
                return Utils.resolvedPromise({ dir: null, json: bowerJson });
            });
        })
            .then(function (d) {
            if (d.dir) {
                return Utils.resolvedPromise(d);
            }
            else {
                var dir = path.join(path.dirname(file.path), 'bower_components');
                return Utils.fileOrDirectoryExists(dir)
                    .then(function (bowerCompsDir) { return Utils.resolvedPromise({ dir: path.relative(process.cwd(), bowerCompsDir), json: d.json }); })
                    .catch(function (e) { return Utils.rejectedPromise(new Error('Failed to resolve bower_components directory')); });
            }
        })
            .then(function (d) {
            // Save
            _this.bowerComponentsDirectory = d.dir;
            var bowerJson = d.json;
            Logger.log(LogType.Information, 'Resolved bower_components directory - ' + d.dir);
            // Log
            Logger.log(LogType.Information, 'Analyzing bower.json contents...');
            // Get all package names
            var bcDir = path.resolve(_this.bowerComponentsDirectory);
            _this.packageNames = fs.readdirSync(bcDir).filter(function (file) {
                return (file !== '.') && (file !== '..') && fs.statSync(path.join(bcDir, file)).isDirectory();
            });
            // Reject if no package names
            if (_this.packageNames.length === 0) {
                Logger.log(LogType.Warning, 'No packages found in the bower.json (path: \'{0}\')', file.path);
                return Utils.rejectedPromise();
            }
            // Check external exports file
            if (_this.options.exportsJsonFilePath) {
                Logger.log(LogType.Information, 'Reading bower exports contents from {0}...', _this.options.exportsJsonFilePath);
                return Utils.readJson(_this.options.exportsJsonFilePath);
            }
            else if (bowerJson.bowerExports) {
                Logger.log(LogType.Information, 'Reading embedded bower exports contents...');
                return Utils.resolvedPromise(bowerJson.bowerExports);
            }
            else {
                return Utils.rejectedPromise(new Error('Bower Exports section not found'));
            }
        })
            .then(function (b) {
            // Log
            Logger.log(LogType.Information, 'Analyzing global rules...');
            // Create rules
            _this.rules = Utils.ensureArray(b.rules, function (r) {
                // Check if we have the rule
                if (!r) {
                    return undefined;
                }
                // Analyze the rule type
                var ruleType = Utils.adjustEnumValue(r.type, null, RuleType, false);
                if (ruleType === null) {
                    Logger.log(LogType.Warning, 'Invalid rule type ({0})', r);
                    return undefined;
                }
                try {
                    // Create rule
                    if (ruleType === RuleType.Source) {
                        var sourceRule = new SourceRule(r);
                        return sourceRule.checkValid(true) ? sourceRule : undefined;
                    }
                    else if (ruleType === RuleType.Filter) {
                        var nameFilterRule = new FilterRule(r);
                        return nameFilterRule.checkValid(true) ? nameFilterRule : undefined;
                    }
                    else if (ruleType === RuleType.Rename) {
                        var renameRule = new RenameRule(r);
                        return renameRule.checkValid(true) ? renameRule : undefined;
                    }
                    else if (ruleType === RuleType.ReplaceContent) {
                        var replaceContentRule = new ReplaceContentRule(r);
                        return replaceContentRule.checkValid(true) ? replaceContentRule : undefined;
                    }
                    else if (ruleType === RuleType.Move) {
                        var moveRule = new MoveRule(r);
                        return moveRule.checkValid(true) ? moveRule : undefined;
                    }
                }
                catch (e) {
                    Logger.log(LogType.Warning, 'Rule instance could not be created (src: \'{0}\', reason: \'{1}\')', r, e);
                }
                return undefined;
            });
            if ((_this.rules === null) || (_this.rules.length === 0)) {
                return Utils.rejectedPromise(new Error('No valid rules present in the bower exports'));
            }
            // Check for duplicate ids
            var rulesEnum = Enumerable.from(_this.rules);
            var typeGroups = rulesEnum.groupBy(function (r) { return r.type; });
            var duplicatesFound = false;
            Logger.log(LogType.Debug, 'Analyzing duplicate rule ids...');
            typeGroups.forEach(function (g) {
                Enumerable.from(g).forEach(function (r, i) {
                    var loggedIds = {};
                    Enumerable.from(g).forEach(function (r1, i1) {
                        if ((r.id === r1.id) && (i !== i1)) {
                            duplicatesFound = true;
                            if (!loggedIds[r.id]) {
                                Logger.log(LogType.Error, 'Duplicate rule id found (id: \'{0}\', type: \'{1}\')', r.id, RuleType[g.key()]);
                            }
                            loggedIds[r.id] = true;
                        }
                    });
                });
            });
            if (duplicatesFound) {
                return Utils.rejectedPromise();
            }
            // Default & Include Rules
            var defaultExportRules = b.defaultExportRules || {};
            defaultExportRules.source = Utils.trimAdjustString(defaultExportRules.source, null, null, null, null);
            defaultExportRules.filter = Utils.trimAdjustString(defaultExportRules.filter, null, null, null, null);
            defaultExportRules.rename = Utils.trimAdjustString(defaultExportRules.rename, null, null, null, null);
            defaultExportRules.replaceContent = Utils.trimAdjustString(defaultExportRules.replaceContent, null, null, null, null);
            defaultExportRules.move = Utils.trimAdjustString(defaultExportRules.move, null, null, null, null);
            defaultExportRules.hierarchyAdjustment = Utils.trimAdjustString(defaultExportRules.hierarchyAdjustment, null, null, null, null);
            var appendExportRules = b.appendExportRules || {};
            appendExportRules.source = Utils.trimAdjustString(appendExportRules.source, null, null, null, null);
            appendExportRules.filter = Utils.trimAdjustString(appendExportRules.filter, null, null, null, null);
            appendExportRules.rename = Utils.trimAdjustString(appendExportRules.rename, null, null, null, null);
            appendExportRules.replaceContent = Utils.trimAdjustString(appendExportRules.replaceContent, null, null, null, null);
            // Create Export Objects
            Logger.log(LogType.Information, 'Analyzing export directives...');
            var exportNameIndex = 1;
            _this.exports = Utils.ensureArray(b.exports, function (x) {
                if (!x) {
                    return undefined;
                }
                var defaultExportName = 'Export - ' + exportNameIndex;
                exportNameIndex += 1;
                x.name = Utils.trimAdjustString(x.name, defaultExportName, defaultExportName, defaultExportName, defaultExportName);
                var xObj = Export.create(x, defaultExportRules, appendExportRules, _this);
                return xObj || undefined;
            });
            if ((_this.exports === null) || (_this.exports.length === 0)) {
                return Utils.rejectedPromise(new Error('No valid exports present in the bower exports'));
            }
            // Return
            return Utils.resolvedPromise();
        })
            .then(function () {
            // Resolve all export rule src
            Logger.log(LogType.Information, 'Resolving export directive sources...');
            _this.packageMainFiles = {};
            return Q.all(Enumerable.from(_this.exports).select(function (x) { return x.resolve(_this); }).toArray());
        })
            .then(function () {
            // Log
            Logger.log(LogType.Information, 'Beginning transformations...');
            // Stream Export Streams
            _this._streamFactoryQueue = null;
            var exportsStream = multistream(Utils.proxy(_this.exportsStreamFactory, _this), { objectMode: true, highWaterMark: Constants.transformStreamReadableHighWaterMark });
            // We are done when exportsStream is done
            return Utils.transferFiles(exportsStream, transform);
        })
            .catch(function (e) {
            // Log
            if (e) {
                Logger.log(LogType.Error, 'Initialization failed (src: \'{0}\', reason: \'{1}\')', file.path, e);
            }
            // Return
            return Utils.rejectedPromise();
        });
    };
    /**
     * Returns the rule instance
     * @param id - Id of the rule
     * @param ruleType - Rule type
     * @returns {TRule} - Rule instance
     */
    ExecutionContext.prototype.resolveRule = function (id, ruleType) {
        return Enumerable.from(this.rules)
            .singleOrDefault(function (r) { return (r.type === ruleType) && (r.id === id); });
    };
    /**
     * Replaces package token iin the given string
     * @param str - String to replace in
     * @param isPathString - Whether the specified string is a path segment
     * @param packageNameOverride - Override for package name
     * @returns {string} - Replaced string
     */
    ExecutionContext.prototype.replacePackageToken = function (str, packageName, isPathString) {
        if (isPathString === void 0) { isPathString = false; }
        if (!Utils.isType(str, String)) {
            return str;
        }
        var packageName = Utils.isType(packageName, String) ? packageName : '';
        str = str.replace(Constants.packageNameTokenRegex, packageName);
        if (isPathString) {
            str = path.normalize(str).replace(/\\/g, '/');
        }
        return str;
    };
    /**
     * Creates streams on demand
     * @param callback - Callback to return the streams
     */
    ExecutionContext.prototype.exportsStreamFactory = function (callback) {
        var _this = this;
        if (this._streamFactoryQueue === null) {
            this._streamFactoryQueue = [];
            Enumerable.from(this.exports).forEach(function (x) {
                Enumerable.from(x.packageNames).forEach(function (p, i) {
                    _this._streamFactoryQueue.push({ exportInstance: x, packageName: p, isFirstPackageForExport: (i === 0) });
                });
            });
        }
        if (this._streamFactoryQueue.length === 0) {
            // No more exports end
            Logger.log(LogType.Information, 'Finished processing all exports');
            callback(null, null);
            return;
        }
        var creationData = this._streamFactoryQueue.shift();
        var exportInstance = (creationData.exportInstance);
        var nextStream = exportInstance.createStream(creationData.packageName, this);
        if (!nextStream) {
            callback(new Error('An unknown error has occurred while creating stream ' + exportInstance.getLogMessageContextInfo({ package: creationData.packageName })), null);
        }
        else {
            if (creationData.isFirstPackageForExport) {
                Logger.log(LogType.Information, 'Processing {0}', exportInstance.getLogMessageContextInfo());
            }
            Logger.log(LogType.Debug, 'Processing {0}', exportInstance.getLogMessageContextInfo({ package: creationData.packageName }));
            callback(null, nextStream);
        }
    };
    return ExecutionContext;
})();
module.exports = ExecutionContext;
