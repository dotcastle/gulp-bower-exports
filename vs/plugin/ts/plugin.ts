import stream = require('stream');
import Utils = require('./lib/utils');
import LogType = require('./lib/types/log-type');
import Constants = require('./lib/constants');
import ExecutionContext = require('./lib/execution-context');

/**
	* Main Plugin
	*/
class Plugin {
	/**
		* Main exported function
		* @param options - Plugin options
		*/
	public static bowerExports(options?: IPluginOptions): stream.Transform {
		// Wait if being debugged
		debugger;

		// Execution Context
		var context = new ExecutionContext();

		// Adjust options
		options = options || <IPluginOptions>{};
		context.options = <IPluginOptions>{};
		context.options.exportsJsonFilePath = Utils.trimAdjustString(options.exportsJsonFilePath, null, null, null, null);
		Constants.logLevel = Utils.adjustEnumValue(options.logLevel, Constants.logLevel, LogType, false);
		context.options.logLevel = Constants.logLevel;

		// Return
		return Utils.createTransform(Utils.proxy(context.initialize, context));
	}
}

/**
 * Export
 */
// ReSharper disable once CommonJsExternalModule
module.exports = Plugin.bowerExports;