/**
 * The partial interface describing bower.json
 * This is the only part we need from the json
 */
interface IBowerJsonData {
	/**
	 * List of dependencies is an object of string key/value pairs
	 */
	dependencies: { [key: string]: string };

	/**
	 * Main section directing this plugin
	 */
	bowerExports: IBowerExportsData;
}
