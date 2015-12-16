var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var gUtil = require('gulp-util');
var Enumerable = require('linq');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var RuleType = require('../types/rule-type');
var Rule = require('./rule');
var FilterRule = require('./filter-rule');
var Utils = require('../utils');
/**
 * ReplaceContent Rule
 */
var ReplaceContentRule = (function (_super) {
    __extends(ReplaceContentRule, _super);
    /**
     * Constructor
     */
    function ReplaceContentRule(ruleData) {
        // Adjust
        ruleData = ruleData || {};
        // Base
        _super.call(this, ruleData);
        // This
        this._if = Utils.trimAdjustString(ruleData.if, null, null, null, null);
        this._replace = Utils.trimAdjustString(ruleData.replace, null, null, null, null);
        this._with = Utils.trimAdjustString(ruleData.with, null, null, null, '');
        this._filters = null;
    }
    /**
     * Valid
     */
    ReplaceContentRule.prototype.checkValid = function (log, exportNameForLog) {
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
    ReplaceContentRule.prototype.resolve = function (exportInstance, executionContext) {
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
    ReplaceContentRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Transform
     */
    ReplaceContentRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
        // Filter
        if (this._filters && this._filters.length
            && Enumerable.from(this._filters).any(function (f) { return !f.test(file, context); })) {
            return Utils.pushFiles(transformStream, [file]);
        }
        // Perform only if we have content
        if (!file.isNull()) {
            var originalContentIsBuffer = gUtil.isBuffer(file.contents);
            var replace = this._replace
                ? Utils.toRegExp(context.executionContext.replacePackageToken(this._replace, context.transformContext.packageName), false)
                : new RegExp('^[\s\S]*$', 'g');
            var withText = context.executionContext.replacePackageToken(this._with, context.transformContext.packageName);
            // We need buffer to replace content
            return Utils.streamToBuffer(file.contents)
                .then(function (buffer) {
                try {
                    // Get String
                    var text = Utils.bufferToText(buffer);
                    // Replace
                    text = text.replace(replace, withText);
                    buffer = new Buffer(text);
                    // Set back
                    if (originalContentIsBuffer) {
                        file.contents = buffer;
                    }
                    else {
                        file.contents = Utils.bufferToStream(buffer);
                    }
                    // Return
                    transformStream.push(file);
                    return Utils.resolvedPromise();
                }
                catch (e) {
                    Logger.log(LogType.Error, 'Failed to replace content (export: \'{0}\', package: \'{1}\', reason: \'{2}\')', context.transformContext.exportInstance.name, context.transformContext.packageName, e);
                    return Utils.rejectedPromise();
                }
            });
        }
        else {
            // Push & skip
            transformStream.push(file);
            return Utils.resolvedPromise();
        }
    };
    return ReplaceContentRule;
})(Rule);
module.exports = ReplaceContentRule;
