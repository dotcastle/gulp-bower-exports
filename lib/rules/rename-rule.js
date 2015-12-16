var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var path = require('path');
var Enumerable = require('linq');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var FileNamePart = require('../types/file-name-part');
var RuleType = require('../types/rule-type');
var Rule = require('./rule');
var FilterRule = require('./filter-rule');
var Utils = require('../utils');
/**
 * Rename Rule
 */
var RenameRule = (function (_super) {
    __extends(RenameRule, _super);
    /**
     * Constructor
     */
    function RenameRule(ruleData) {
        // Adjust
        ruleData = ruleData || {};
        // Base
        _super.call(this, ruleData);
        // This
        this._if = Utils.trimAdjustString(ruleData.if, null, null, null, null);
        this._replace = Utils.trimAdjustString(ruleData.replace, null, null, null, null);
        this._in = Utils.adjustEnumValue(ruleData.in, FileNamePart.FileName, FileNamePart, false);
        this._with = Utils.trimAdjustString(ruleData.with, null, null, null, '');
        this._filters = null;
    }
    /**
     * Valid
     */
    RenameRule.prototype.checkValid = function (log, exportNameForLog) {
        var isValid = _super.prototype.checkValid.call(this, true, exportNameForLog);
        if (this._with === null) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'Invalid property - with {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        return isValid;
    };
    /**
     * Resolves sources
     * @param exportInstance - Export directive instance
     * @param executionContext - Execution context
     */
    RenameRule.prototype.resolve = function (exportInstance, executionContext) {
        if (this._if !== null) {
            var filter = Utils.trimAdjustString(this._if, null, null, null, '');
            filter = (filter || '').split(',');
            filter = Enumerable.from(filter).distinct().toArray();
            try {
                this._filters = Utils.ensureArray(filter, function (s) {
                    s = Utils.trimAdjustString(s, null, null, null, null);
                    if (!s) {
                        return undefined;
                    }
                    if (s.indexOf('#') === 0) {
                        return executionContext.resolveRule(s.substr(1), RuleType.Filter) || undefined;
                    }
                    var rule = new FilterRule({
                        id: Utils.generateUniqueRuleId(RuleType.Filter),
                        type: RuleType[RuleType.Filter].toLowerCase(),
                        fullnameLike: s
                    });
                    if (!rule.checkValid(true, exportInstance.name)) {
                        throw new Error();
                    }
                    return rule;
                }) || [];
            }
            catch (e) {
                return Utils.rejectedPromise();
            }
        }
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     * @param context - Context data
     */
    RenameRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Transform
     */
    RenameRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
        // Filter
        if (this._filters && this._filters.length
            && Enumerable.from(this._filters).any(function (f) { return !f.test(file, context); })) {
            return Utils.pushFiles(transformStream, [file]);
        }
        // Rename
        var replace = this._replace
            ? Utils.toRegExp(context.executionContext.replacePackageToken(this._replace, context.transformContext.packageName), true)
            : new RegExp('^.*$', 'g');
        var withText = context.executionContext.replacePackageToken(this._with, context.transformContext.packageName);
        if (this._in === FileNamePart.FullName) {
            var name_1 = file.relative;
            name_1 = name_1.replace(replace, withText);
            Utils.setFilePath(file, name_1);
        }
        else if (this._in === FileNamePart.DirName) {
            var name_2 = path.dirname(file.relative);
            name_2 = name_2.replace(replace, withText);
            Utils.setFilePath(file, path.join(name_2, path.basename(file.relative)));
        }
        else if (this._in === FileNamePart.FileName) {
            var name_3 = path.basename(file.relative);
            name_3 = name_3.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), name_3));
        }
        else if (this._in === FileNamePart.BaseName) {
            var extname = path.extname(file.relative);
            var name_4 = path.basename(file.relative, extname);
            name_4 = name_4.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), name_4 + extname));
        }
        else if (this._in === FileNamePart.ExtName) {
            var extname = path.extname(file.relative);
            var name_5 = extname;
            name_5 = name_5.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), path.basename(file.relative, extname) + name_5));
        }
        // Push
        return Utils.pushFiles(transformStream, [file]);
    };
    return RenameRule;
})(Rule);
module.exports = RenameRule;
