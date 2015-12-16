var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var path = require('path');
var Q = require('q');
var vinylSrc = require('vinyl-fs');
var Enumerable = require('linq');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var Rule = require('./rule');
var Constants = require('../constants');
var Utils = require('../utils');
/**
 * Source Rule
 */
var SourceRule = (function (_super) {
    __extends(SourceRule, _super);
    /**
     * Constructor
     */
    function SourceRule(ruleData) {
        // Adjust
        ruleData = ruleData || {};
        // Base
        _super.call(this, ruleData);
        // This
        var src = Utils.trimAdjustString(ruleData.src, null, null, null, null);
        src = src ? src.split(',') : src;
        this._src = Utils.ensureArray(src, function (s) { return Utils.trimAdjustString(s, undefined, undefined, undefined, undefined); });
        this._resolvedSrc = null;
    }
    Object.defineProperty(SourceRule.prototype, "src", {
        /**
         * Src
         */
        get: function () {
            return this._src;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Valid
     */
    SourceRule.prototype.checkValid = function (log, exportNameForLog) {
        var isValid = _super.prototype.checkValid.call(this, true, exportNameForLog);
        if (!this._src || (this._src.length === 0)) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'Invalid property - src {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        return isValid;
    };
    /**
     * Resolves sources
     * @param exportInstance - Export directive instance
     * @param executionContext - Execution context
     */
    SourceRule.prototype.resolve = function (exportInstance, executionContext) {
        var _this = this;
        if (this._resolvedSrc) {
            return Utils.resolvedPromise();
        }
        this._resolvedSrc = {};
        return Q.all(Enumerable.from(exportInstance.packageNames).select(function (p) {
            return _this.getSrc(p, exportInstance, executionContext)
                .then(function (s) {
                if ((s.length === 0) || !Enumerable.from(s).any(function (p) { return p.indexOf('!') < 0; })) {
                    Logger.log(LogType.Error, 'No positive source glob pattern specified (export: \'{0}\', src: \'{1}\')', exportInstance.name, _this._src);
                    return Utils.rejectedPromise();
                }
                // Save
                _this._resolvedSrc[p] = s;
                return Utils.resolvedPromise();
            })
                .catch(function (e) {
                Logger.log(LogType.Error, 'Failed to resolve source patterns (export: \'{0}\', src: \'{1}\', package: \'{2}\' reason: \'{3}\')', exportInstance.name, _this.src, p, e);
                return Utils.rejectedPromise();
            });
        })
            .toArray());
    };
    /**
     * Returns this rule's stream
     * @param context - Context data
     */
    SourceRule.prototype.createStream = function (context) {
        var base = path.join(context.executionContext.bowerComponentsDirectory, context.transformContext.packageName);
        var src = this._resolvedSrc[context.transformContext.packageName];
        var resultStream;
        // Source Glob Stream
        try {
            resultStream = vinylSrc.src(src, { cwd: base, base: base });
            resultStream['name'] = context.transformContext.exportInstance.name + ' - ' + context.transformContext.packageName + ' - SOURCE';
            return resultStream;
        }
        catch (e) {
            Logger.log(LogType.Error, 'Failed creating source glob stream (export: \'{0}\', package: \'{1}\', src: \'{2}\')', context.transformContext.exportInstance.name, context.transformContext.packageName, src);
            return null;
        }
    };
    /**
     * Gets the source files
     */
    SourceRule.prototype.getSrc = function (packageName, exportInstance, executionContext) {
        var _this = this;
        var promise = Utils.resolvedPromise(Enumerable.from(this.src).toArray());
        // Return
        return promise
            .then(function (src) {
            var itemIndex = Enumerable.from(src).indexOf(function (p) { return Utils.testRegExp(Constants.mainSrcTokenRegex, p); });
            if (itemIndex >= 0) {
                return _this.getPackageMainFiles(packageName, exportInstance, executionContext)
                    .then(function (s) {
                    return src.slice(0, itemIndex).concat(s).concat(src.slice(itemIndex + 1));
                })
                    .catch(function () {
                    return src.slice(0, itemIndex).concat(src.slice(itemIndex + 1));
                });
            }
            else {
                return src;
            }
        })
            .then(function (src) {
            return _this._resolvedSrc[packageName] = Enumerable.from(src)
                .select(function (s) { return executionContext.replacePackageToken(s, packageName); })
                .toArray();
        });
    };
    /**
     * Returns package's main file list
     * @param pkgName - Package name
     */
    SourceRule.prototype.getPackageMainFiles = function (packageName, exportInstance, executionContext) {
        // Check if we already have them
        var mainFiles = executionContext.packageMainFiles[packageName];
        if (mainFiles && (mainFiles instanceof Array)) {
            return Utils.resolvedPromise(mainFiles);
        }
        // Path
        var pkgFolderPath = path.resolve(executionContext.bowerComponentsDirectory, packageName);
        var bowerJsonPath = path.join(pkgFolderPath, '.bower.json');
        // Process
        return Utils.readJson(bowerJsonPath)
            .then(function (bowerJson) {
            mainFiles = Utils.ensureArray(bowerJson['main'], function (s) { return Utils.trimAdjustString(s, undefined, undefined, undefined, undefined); });
            if (mainFiles && (mainFiles.length > 0)) {
                executionContext.packageMainFiles[packageName] = mainFiles;
                return mainFiles;
            }
            else {
                Logger.log(LogType.Warning, 'Main files not found in .bower.json! (export: \'{0}\', package: \'{1}\')', exportInstance.name, packageName);
                return Utils.rejectedPromise();
            }
        });
    };
    return SourceRule;
})(Rule);
module.exports = SourceRule;
