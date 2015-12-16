var Utils = require('./lib/utils');
var LogType = require('./lib/types/log-type');
var Constants = require('./lib/constants');
var ExecutionContext = require('./lib/execution-context');
/**
    * Main Plugin
    */
var Plugin = (function () {
    function Plugin() {
    }
    /**
        * Main exported function
        * @param options - Plugin options
        */
    Plugin.bowerExports = function (options) {
        // Wait if being debugged
        debugger;
        // Execution Context
        var context = new ExecutionContext();
        // Adjust options
        options = options || {};
        context.options = {};
        context.options.exportsJsonFilePath = Utils.trimAdjustString(options.exportsJsonFilePath, null, null, null, null);
        context.options.emitBowerJsonFile = !!options.emitBowerJsonFile;
        Constants.logLevel = Utils.adjustEnumValue(options.logLevel, Constants.logLevel, LogType, false);
        context.options.logLevel = Constants.logLevel;
        // Return
        return Utils.createTransform(Utils.proxy(context.initialize, context));
    };
    return Plugin;
})();
/**
 * Export
 */
// ReSharper disable once CommonJsExternalModule
module.exports = Plugin.bowerExports;
