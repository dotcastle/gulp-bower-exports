var gUtil = require('gulp-util');
var File = require('vinyl');
var Enumerable = require('linq');
var LogType = require('./types/log-type');
var Constants = require('./constants');
/**
 * Logger
 */
var Logger = (function () {
    function Logger() {
    }
    /**
     * Logs the message to console or gUtil.log
     * @param logType - Log type of the message
     * @param format - Message format
     * @param args - Format arguments
     */
    Logger.log = function (logType, format) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        logType = Logger.adjustEnumValue(logType, LogType.Information, LogType, false);
        if (logType < Constants.logLevel) {
            return;
        }
        var allArgs = [];
        if (typeof (format) !== 'string') {
            format = '';
        }
        // Detect type name prefix
        var typeNamePrefix = LogType[logType].toUpperCase();
        // Color
        switch (logType) {
            case LogType.Information:
                {
                    allArgs.push(gUtil.colors.blue(typeNamePrefix));
                    break;
                }
            case LogType.Success:
                {
                    allArgs.push(gUtil.colors.green(typeNamePrefix));
                    break;
                }
            case LogType.Warning:
                {
                    allArgs.push(gUtil.colors.yellow(typeNamePrefix));
                    break;
                }
            case LogType.Error:
                {
                    allArgs.push(gUtil.colors.red(typeNamePrefix));
                    break;
                }
            default:
                {
                    allArgs.push(typeNamePrefix);
                    break;
                }
        }
        allArgs.push(':');
        // Update Args
        var updatedArgs = Enumerable.from(args)
            .select(function (a) {
            if (!!a && File.isVinyl(a)) {
                a = JSON.stringify(Logger.toFileInfo(a));
            }
            return a;
        })
            .toArray();
        allArgs.push(Logger.formatString.apply(null, [format].concat(updatedArgs)));
        // Log
        gUtil.log.apply(gUtil, allArgs);
    };
    /**
     * Adjusts the given enum value to be valid
     * @param val - Value to adjust
     * @param defaultValue - Default value to return if val could not be converted
     * @param typeObject - Enum type
     * @param caseSensitive - Whether to use case sensitive comparisons
     * @returns {TType} - Converted value
     */
    Logger.adjustEnumValue = function (val, defaultValue, typeObject, caseSensitive) {
        // Default value if not valid
        if (((typeof (val) !== 'string') && (typeof (val) !== 'number'))
            || ((typeof (val) === 'number') && isNaN(val))) {
            return defaultValue;
        }
        // Convert string to num
        if (typeof (val) === 'string') {
            var textVal = val.trim();
            if (textVal) {
                for (var prop in typeObject) {
                    if (typeObject.hasOwnProperty(prop)) {
                        if ((!caseSensitive && (textVal.toLowerCase() === prop.toString().toLowerCase()))
                            || (caseSensitive && (textVal === prop.toString()))) {
                            // Check if this is a number
                            var propNum = parseInt(prop);
                            if (!isNaN(propNum) && (propNum.toString() === prop.toString())
                                && (typeObject[typeObject[prop]] === prop)) {
                                return propNum;
                            }
                            return typeObject[prop];
                        }
                    }
                }
            }
            return defaultValue;
        }
        // Number
        if (typeof (val) === 'number') {
            if (typeof (typeObject[val]) == 'undefined') {
                return defaultValue;
            }
            else {
                return val;
            }
        }
        // Return Default
        return defaultValue;
    };
    /**
     * Formats the given string
     * @param format - String format
     * @param args - Argument list
     * @returns {string} - Formatted string
     */
    Logger.formatString = function (format) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (typeof (format) !== 'string') {
            return format;
        }
        args = args || [];
        Enumerable.from(args).forEach(function (a, i) {
            return format = format.replace(new RegExp('\\{' + i + '\\}', 'g'), Logger.toStr(a));
        });
        return format;
    };
    /**
     * Converts an object to string
     * @param obj
     * @returns {string} String representing the object
     */
    Logger.toStr = function (obj, beautifySpaces) {
        if (beautifySpaces === void 0) { beautifySpaces = 0; }
        if (typeof (obj) === 'undefined') {
            return '<undefined>';
        }
        else if (obj === null) {
            return '<null>';
        }
        else if (typeof (obj) === 'string') {
            return obj;
        }
        // Try getting from toString
        var hasStr = false;
        var str = null;
        try {
            // ReSharper disable once QualifiedExpressionMaybeNull
            str = obj.toString();
            // Check if the text is the default one
            if ((typeof (str) === 'string') && (str !== '[object Object]')) {
                hasStr = true;
            }
        }
        catch (e) { }
        // Try other methods if we do not have str
        if (!hasStr) {
            try {
                str = JSON.stringify(obj, null, beautifySpaces);
            }
            catch (e) {
                // ReSharper disable once QualifiedExpressionMaybeNull
                str = obj.toString() + ' (JSON.stringify failed (' + e.toString() + '). Using obj.toString)';
            }
        }
        // Append Stack Trace
        if (Constants.isDebug) {
            if (obj['stack']) {
                str += ' (stacktrace: ' + Logger.toStr(obj['stack']) + ')';
            }
            else if (obj['stacktrace']) {
                str += ' (stacktrace: ' + Logger.toStr(obj['stacktrace']) + ')';
            }
        }
        return str;
    };
    /**
     * Simple file info
     */
    Logger.toFileInfo = function (file) {
        var fileInfo = {};
        try {
            fileInfo.cwd = file.cwd;
        }
        catch (e) { }
        try {
            fileInfo.base = file.base;
        }
        catch (e) { }
        try {
            fileInfo.path = file.path;
        }
        catch (e) { }
        try {
            fileInfo.relative = file.relative;
        }
        catch (e) { }
        try {
            fileInfo.isBuffer = file.isBuffer();
        }
        catch (e) { }
        try {
            fileInfo.isStream = file.isStream();
        }
        catch (e) { }
        try {
            fileInfo.isNull = file.isNull();
        }
        catch (e) { }
        try {
            fileInfo.isDirectory = file.isDirectory();
        }
        catch (e) { }
        return fileInfo;
    };
    return Logger;
})();
module.exports = Logger;
