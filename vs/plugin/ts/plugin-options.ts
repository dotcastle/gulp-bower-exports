/**
	* Plugin Options
	*/
interface IPluginOptions {
	/**
	 * External json file containing the exports section
	 * If null, the exports section is expected to be present in
	 * the bower.json file with the property name "bowerExports"
	 * This path can be absolute or relative path (relative to cwd)
	 * Default: null
	 */
	exportsJsonFilePath?: string;

	/**
	 * Minimum log level to emit
	 * 0 => Debug
	 * 1 => Information
	 * 2 => Warning
	 * 3 => Success
	 * 4 => Error
	 * Default: Warning
	 */
	logLevel: number | string;
}	
