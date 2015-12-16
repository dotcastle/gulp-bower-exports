var LogType = require('./types/log-type');
/**
 * Constants
 */
var Constants = (function () {
    function Constants() {
    }
    Constants.isDebug = true;
    Constants.logLevel = LogType.Information;
    Constants.pluginName = 'gulp-bower-exports';
    Constants.mainSrcToken = '#main#';
    Constants.mainSrcTokenRegex = /^#main#$/g;
    Constants.packageNameToken = "#package#";
    Constants.packageNameTokenRegex = /#package#/g;
    Constants.transformStreamReadableHighWaterMark = 64;
    return Constants;
})();
module.exports = Constants;
