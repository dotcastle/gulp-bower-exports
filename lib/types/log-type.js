/**
 * Log type
 */
var LogType;
(function (LogType) {
    LogType[LogType["Debug"] = 0] = "Debug";
    LogType[LogType["Information"] = 1] = "Information";
    LogType[LogType["Warning"] = 2] = "Warning";
    LogType[LogType["Success"] = 3] = "Success";
    LogType[LogType["Error"] = 4] = "Error";
})(LogType || (LogType = {}));
module.exports = LogType;
