var Q = require('q');
var Enumerable = require('linq');
var Utils = require('./utils');
var LogType = require('./types/log-type');
var Logger = require('./logger');
var HierarchyAdjustment = require('./types/hierarchy-adjustment');
var RuleType = require('./types/rule-type');
var SourceRule = require('./rules/source-rule');
var FilterRule = require('./rules/filter-rule');
var RenameRule = require('./rules/rename-rule');
var ReplaceContentRule = require('./rules/replace-content-rule');
var MoveRule = require('./rules/move-rule');
var TransformContext = require('./transform-context');
var ContextTuple = require('./types/context-tuple');
/**
 * Export directive
 */
var Export = (function () {
    function Export() {
    }
    /**
     * Constructor
     */
    Export.create = function (data, defaultExportRules, appendExportRules, context) {
        data = data || {};
        var exportInstance = new Export();
        exportInstance._exportData = data;
        var hasErrors = false;
        // Name
        var name = exportInstance._name = Utils.trimAdjustString(data.name, null, null, null, null);
        // Log
        Logger.log(LogType.Debug, 'Creating export directive - \'' + name + '\' ({0})...', data);
        // Package names
        Logger.log(LogType.Debug, 'Analyzing package names... {0}', exportInstance.getLogMessageContextInfo());
        var from = Utils.trimAdjustString(data.from, null, null, null, null);
        from = from ? from.split(',') : from;
        exportInstance._packageNames = Enumerable.from(Utils.ensureArray(from, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            var regex = Utils.toRegExp(s, true);
            if (!regex) {
                hasErrors = true;
                Logger.log(LogType.Warning, 'Failed to convert package name string to RegExp {0}', exportInstance.getLogMessageContextInfo({ package: s }));
                return undefined;
            }
            return Enumerable.from(context.packageNames)
                .where(function (p) { return Utils.testRegExp(regex, p); })
                .toArray();
        }) || []).distinct().toArray();
        if (hasErrors) {
            return null;
        }
        // Source Select
        Logger.log(LogType.Debug, 'Analyzing source rules... (export: \'{0}\')', name);
        var source = Utils.trimAdjustString(data.select, defaultExportRules.source, defaultExportRules.source, defaultExportRules.source, '');
        source = Utils.replaceBracedGlobPatterns(source);
        source = (source || '').split(',');
        var concatSource = Utils.trimAdjustString(appendExportRules.source, null, null, null, null);
        concatSource = Utils.replaceBracedGlobPatterns(concatSource);
        concatSource = (concatSource || '').split(',');
        source = source.concat(concatSource);
        source = Enumerable.from(source).distinct().toArray();
        var sourceRules = Utils.ensureArray(source, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s === '#main#') {
                return new SourceRule({
                    id: Utils.generateUniqueRuleId(RuleType.Source),
                    type: RuleType[RuleType.Source].toLowerCase(),
                    src: s
                });
            }
            else if (s.indexOf('#') === 0) {
                return context.resolveRule(s.substr(1), RuleType.Source) || undefined;
            }
            else {
                return new SourceRule({
                    id: Utils.generateUniqueRuleId(RuleType.Source),
                    type: RuleType[RuleType.Source].toLowerCase(),
                    src: s
                });
            }
        }) || [];
        if (sourceRules.length === 0) {
            exportInstance._source = null;
        }
        else if (sourceRules.length === 1) {
            exportInstance._source = sourceRules[0];
        }
        else {
            exportInstance._source = new SourceRule({
                id: Utils.generateUniqueRuleId(RuleType.Source),
                type: RuleType[RuleType.Source].toLowerCase(),
                src: Enumerable.from(sourceRules).selectMany(function (s) { return s.src || []; }).toJoinedString(',')
            });
        }
        if (exportInstance._source != null) {
            if (!exportInstance._source.checkValid(true, name)) {
                return null;
            }
        }
        // Filter
        Logger.log(LogType.Debug, 'Analyzing filter rules... {0}', exportInstance.getLogMessageContextInfo());
        var filter = Utils.trimAdjustString(data.filter, defaultExportRules.filter, defaultExportRules.filter, defaultExportRules.filter, '');
        filter = (filter || '').split(',');
        var concatFilter = Utils.trimAdjustString(appendExportRules.filter, null, null, null, null);
        concatFilter = (concatFilter || '').split(',');
        filter = filter.concat(concatFilter);
        filter = Enumerable.from(filter).distinct().toArray();
        exportInstance._filter = Utils.ensureArray(filter, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return context.resolveRule(s.substr(1), RuleType.Filter) || undefined;
            }
            var rule = new FilterRule({
                id: Utils.generateUniqueRuleId(RuleType.Filter),
                type: RuleType[RuleType.Filter].toLowerCase(),
                fullnameLike: s
            });
            if (!rule.checkValid(true, name)) {
                hasErrors = true;
                rule = undefined;
            }
            return rule;
        }) || [];
        if (hasErrors) {
            return null;
        }
        // Rename
        Logger.log(LogType.Debug, 'Analyzing rename rules... {0}', exportInstance.getLogMessageContextInfo());
        var rename = Utils.trimAdjustString(data.rename, defaultExportRules.rename, defaultExportRules.rename, defaultExportRules.rename, '');
        rename = (rename || '').split(',');
        var concatRename = Utils.trimAdjustString(appendExportRules.rename, null, null, null, null);
        concatRename = (concatRename || '').split(',');
        rename = rename.concat(concatRename);
        rename = Enumerable.from(rename).distinct().toArray();
        exportInstance._rename = Utils.ensureArray(rename, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return context.resolveRule(s.substr(1), RuleType.Rename) || undefined;
            }
            var rule = new RenameRule({
                id: Utils.generateUniqueRuleId(RuleType.Rename),
                type: RuleType[RuleType.Rename].toLowerCase(),
                with: s
            });
            if (!rule.checkValid(true, name)) {
                hasErrors = true;
                rule = undefined;
            }
            return rule;
        }) || [];
        if (hasErrors) {
            return null;
        }
        // Replace content
        Logger.log(LogType.Debug, 'Analyzing replace content rules... {0}', exportInstance.getLogMessageContextInfo());
        var replaceContent = Utils.trimAdjustString(data.replaceContent, defaultExportRules.replaceContent, defaultExportRules.replaceContent, defaultExportRules.replaceContent, '');
        replaceContent = (replaceContent || '').split(',');
        var concatReplaceContent = Utils.trimAdjustString(appendExportRules.replaceContent, null, null, null, null);
        concatReplaceContent = (concatReplaceContent || '').split(',');
        replaceContent = replaceContent.concat(concatReplaceContent);
        replaceContent = Enumerable.from(replaceContent).distinct().toArray();
        exportInstance._replaceContent = Utils.ensureArray(replaceContent, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return context.resolveRule(s.substr(1), RuleType.ReplaceContent) || undefined;
            }
            var rule = new ReplaceContentRule({
                id: Utils.generateUniqueRuleId(RuleType.ReplaceContent),
                type: RuleType[RuleType.ReplaceContent].toLowerCase(),
                with: s
            });
            if (!rule.checkValid(true, name)) {
                hasErrors = true;
                rule = undefined;
            }
            return rule;
        }) || [];
        if (hasErrors) {
            return null;
        }
        // Move
        Logger.log(LogType.Debug, 'Analyzing move rules... {0}', exportInstance.getLogMessageContextInfo());
        exportInstance._move = null;
        var move = Utils.trimAdjustString(data.move, defaultExportRules.move, defaultExportRules.move, defaultExportRules.move, null);
        if (move) {
            if (move.indexOf('#') === 0) {
                exportInstance._move = context.resolveRule(move.substr(1), RuleType.Move);
            }
            else {
                exportInstance._move = new MoveRule({
                    id: Utils.generateUniqueRuleId(RuleType.Move),
                    type: RuleType[RuleType.Move].toLowerCase(),
                    to: move
                });
            }
        }
        if (exportInstance._move != null) {
            if (!exportInstance._move.checkValid(true, name)) {
                return null;
            }
        }
        exportInstance._overridingMovePackageName = Utils.trimAdjustString(data.overridingMovePackageName, null, null, null, '');
        exportInstance._hierarchyAdjustment = Utils.adjustEnumValue(data.withHierarchy, null, HierarchyAdjustment, false);
        if (exportInstance._hierarchyAdjustment === null) {
            exportInstance._hierarchyAdjustment = Utils.adjustEnumValue(defaultExportRules.hierarchyAdjustment, null, HierarchyAdjustment, false);
        }
        // Return
        return exportInstance;
    };
    Object.defineProperty(Export.prototype, "exportData", {
        /**
         * Export data
         */
        get: function () {
            return this._exportData;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "name", {
        /**
         * Name
         */
        get: function () {
            return this._name;
        },
        /**
         * Name
         */
        set: function (val) {
            this._name = val;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "packageNames", {
        /**
         * Package names
         */
        get: function () {
            return this._packageNames;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "source", {
        /**
         * Source rule
         */
        get: function () {
            return this._source;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "filter", {
        /**
         * Filter rules
         */
        get: function () {
            return this._filter;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "rename", {
        /**
         * Rename rules
         */
        get: function () {
            return this._rename;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "replaceContent", {
        /**
         * Replace content rules
         */
        get: function () {
            return this._replaceContent;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "move", {
        /**
         * Move rules
         */
        get: function () {
            return this._move;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "overridingMovePackageName", {
        /**
         * Overridden package name
         * @returns {}
         */
        get: function () {
            return this._overridingMovePackageName;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Export.prototype, "hierarchyAdjustment", {
        /**
         * Hierarchy adjustment
         * @returns {}
         */
        get: function () {
            return this._hierarchyAdjustment;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Identity info for the log
     */
    Export.prototype.getLogMessageContextInfo = function (otherProperties) {
        var strs = [];
        var name = Utils.trimAdjustString(this._name, null, null, null, null);
        if (name !== null) {
            strs.push('export: \'' + this.name + '\'');
        }
        else {
            strs.push('export: \'' + JSON.stringify(this._exportData) + '\'');
        }
        if (otherProperties) {
            for (var prop in otherProperties) {
                if (otherProperties.hasOwnProperty(prop)) {
                    strs.push(prop + ': \'' + Utils.toStr(otherProperties[prop]) + '\'');
                }
            }
        }
        return '(' + Enumerable.from(strs).toJoinedString(', ') + ')';
    };
    /**
     * Resolves the source patterns
     */
    Export.prototype.resolve = function (executionContext) {
        var _this = this;
        var promises = [];
        promises.push(this.source.resolve(this, executionContext));
        promises = promises.concat(Enumerable.from(this.filter).select(function (f) { return f.resolve(_this, executionContext); }).toArray());
        promises = promises.concat(Enumerable.from(this.rename).select(function (r) { return r.resolve(_this, executionContext); }).toArray());
        promises = promises.concat(Enumerable.from(this.replaceContent).select(function (r) { return r.resolve(_this, executionContext); }).toArray());
        if (this.move) {
            promises.push(this.move.resolve(this, executionContext));
        }
        // Return
        return Q.all(promises);
    };
    /**
     * Creates the export stream for the specified package name
     */
    Export.prototype.createStream = function (packageName, context) {
        // Check valid
        if (!Enumerable.from(this._packageNames).contains(packageName)) {
            Logger.log(LogType.Warning, 'The package does not exist in the bower dependencies. {0}', this.getLogMessageContextInfo({ package: packageName }));
            return null;
        }
        // Execution Context
        var transformContext = new TransformContext(this, packageName, this.hierarchyAdjustment);
        var contextTuple = new ContextTuple(context, transformContext);
        // Combined Source Stream
        var transformStream = this.source.createStream(contextTuple);
        if (!transformStream) {
            return null;
        }
        // Pass it through filters
        Enumerable.from(this.filter).forEach(function (f) { return transformStream = transformStream.pipe(f.createStream(contextTuple)); });
        // Rename Rules
        Enumerable.from(this.rename).forEach(function (r) { return transformStream = transformStream.pipe(r.createStream(contextTuple)); });
        // Replace Content Rules
        Enumerable.from(this.replaceContent).forEach(function (r) { return transformStream = transformStream.pipe(r.createStream(contextTuple)); });
        // Move rule
        if (this.move) {
            transformStream = transformStream.pipe(this.move.createStream(contextTuple));
        }
        // Pipe the package streams into the transform
        transformStream['name'] = this.name + ' - ' + packageName;
        return transformStream;
    };
    return Export;
})();
module.exports = Export;
