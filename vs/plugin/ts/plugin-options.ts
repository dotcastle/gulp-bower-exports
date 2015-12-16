/**
	* Plugin Options
	*/
interface IPluginOptions {
	/**
	 * External json file containing the exports section
	 * If null, the exports section is expected to be present in
	 * the bower.json file with the property name "bowerExports"
	 * This path can be absolute or relative path (relative to cwd)
	 * Default: '<source file base name>.exports.json'
	 */
	exportsJsonFilePath?: string;

	/**
	 * Whether to remove the bower.json file itself from the
	 * output upon successful processing of its contents
	 * and adding them to the pipeline
	 * Default: false
	 */
	emitBowerJsonFile?: boolean;

	/**
	 * Minimum log level to emit
	 * 0 => Debug
	 * 1 => Information
	 * 2 => Warning
	 * 3 => Success
	 * 4 => Error
	 */
	logLevel: number | string;
}	
