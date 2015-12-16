var Enumerable = require('linq');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var Utils = require('../utils');
var RuleType = require('../types/rule-type');
/**
 * Rule base
 */
var Rule = (function () {
    /**
     * Constructor
     */
    function Rule(ruleData) {
        ruleData = ruleData || {};
        this._ruleData = ruleData;
        this._id = Utils.trimAdjustString(ruleData.id, null, null, null, null);
        this._type = Utils.adjustEnumValue(ruleData.type, null, RuleType, false);
    }
    Object.defineProperty(Rule.prototype, "typeDisplayName", {
        /**
         * Type display name
         */
        get: function () {
            return ((this._type === null) ? 'Unknown' : RuleType[this._type]) + ' rule';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rule.prototype, "ruleData", {
        /**
         * Rule data
         */
        get: function () {
            return this._ruleData;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rule.prototype, "id", {
        /**
         * Id
         */
        get: function () {
            return this._id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Rule.prototype, "type", {
        /**
         * Rule type
         */
        get: function () {
            return this._type;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Identity info for the log
     */
    Rule.prototype.getLogMessageContextInfo = function (exportNameForLog, otherProperties) {
        var strs = [];
        exportNameForLog = Utils.trimAdjustString(exportNameForLog, null, null, null, null);
        if (exportNameForLog != null) {
            strs.push('export: \'' + exportNameForLog + '\'');
        }
        strs.push('type: \'' + this.typeDisplayName + '\'');
        if (this._id !== null) {
            strs.push('id: \'' + this._id + '\'');
        }
        else {
            strs.push('data: \'' + JSON.stringify(this._ruleData) + '\'');
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
     * Check validity
     * @param log - whether to log
     * @param exportNameForLog - Name for logging
     */
    Rule.prototype.checkValid = function (log, exportNameForLog) {
        var isValid = true;
        exportNameForLog = Utils.trimAdjustString(exportNameForLog, '', '', '', '');
        if (log) {
            Logger.log(LogType.Debug, 'Checking validity {0}...', this.getLogMessageContextInfo(exportNameForLog));
        }
        if (this._id === null) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'Invalid property - id {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        if (this._type === null) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'Invalid property - type {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        return isValid;
    };
    /**
     * Resolves sources
     * @param exportInstance - Export directive instance
     * @param executionContext - Execution context
     */
    Rule.prototype.resolve = function (exportInstance, executionContext) {
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     * @param context - Context data
     */
    Rule.prototype.createStream = function (context) {
        return null;
    };
    return Rule;
})();
module.exports = Rule;
