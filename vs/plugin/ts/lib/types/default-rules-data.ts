/**
 * Rules to be applied when not specified in the exports
 */
interface IDefaultRulesData {
	/**
	 * Id of the source rule element
	 */
	source?: string;

	/**
	 * Id(s) of name filter rule elements
	 */
	filter?: string;

	/**
	 * Id(s) of rename rule elements
	 */
	rename?: string;

	/**
	 * Id(s) of replace content rule elements
	 */
	replaceContent?: string;

	/**
	 * Id of move rule element
	 */
	move?: string;

	/**
	 * Adjusts the hierarchy of the target files.
	 * Minimal will reduce the hierarchy depth to lowest possible extent.
	 * Flatten will remove hierarchy and copies all files to the target location
	 * (Warning: Flatten may cause some files to be overwritten).
	 * Default: None
	 */
	hierarchyAdjustment?: string;
}
