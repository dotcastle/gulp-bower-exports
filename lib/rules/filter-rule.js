var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var path = require('path');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var Rule = require('./rule');
var Utils = require('../utils');
/**
 * Filter Rule
 */
var FilterRule = (function (_super) {
    __extends(FilterRule, _super);
    /**
     * Constructor
     */
    function FilterRule(ruleData) {
        // Adjust
        ruleData = ruleData || {};
        // Base
        _super.call(this, ruleData);
        // This
        this._fullnameLike = Utils.trimAdjustString(ruleData.fullnameLike, null, null, null, null);
        this._dirnameLike = Utils.trimAdjustString(ruleData.dirnameLike, null, null, null, null);
        this._filenameLike = Utils.trimAdjustString(ruleData.filenameLike, null, null, null, null);
        this._basenameLike = Utils.trimAdjustString(ruleData.basenameLike, null, null, null, null);
        this._extnameLike = Utils.trimAdjustString(ruleData.extnameLike, null, null, null, null);
    }
    /**
     * Valid
     */
    FilterRule.prototype.checkValid = function (log, exportNameForLog) {
        var isValid = _super.prototype.checkValid.call(this, true, exportNameForLog);
        if (!this._fullnameLike && !this._dirnameLike
            && !this._filenameLike && !this._basenameLike
            && !this._extnameLike) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'At least one of the properties should be set (fullnameLike, dirnameLike, filenameLike, basenameLike, extnameLike) {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        return isValid;
    };
    /**
     * Returns this rule's stream
     * @param context - Context data
     */
    FilterRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Tests the file against this rule
     * @param file - File to test
     */
    FilterRule.prototype.test = function (file, context) {
        return (!this._fullnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._fullnameLike, context.transformContext.packageName), true), file.relative))
            && (!this._filenameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._filenameLike, context.transformContext.packageName), true), path.basename(file.relative)))
            && (!this._dirnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._dirnameLike, context.transformContext.packageName), true), path.dirname(file.relative)))
            && (!this._basenameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._basenameLike, context.transformContext.packageName), true), path.basename(file.relative, path.extname(file.relative))))
            && (!this._extnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._extnameLike, context.transformContext.packageName), true), path.extname(file.relative)));
    };
    /**
     * Transform
     */
    FilterRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
        if (this.test(file, context)) {
            transformStream.push(file);
        }
        return Utils.resolvedPromise();
    };
    return FilterRule;
})(Rule);
module.exports = FilterRule;
