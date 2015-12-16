/**
 * Specifies criteria to relocate the files to a different location relative to the dest directory
 */
interface IMoveRuleData extends IRuleData {
	/**
	 * Adjusts the hierarchy of the target files.
	 * Minimal will reduce the hierarchy depth to lowest possible extent.
	 * Flatten will remove hierarchy and copies all files to the target location
	 * (Warning: Flatten may cause some files to be overwritten).
	 * Default: None
	 */
	withHierarchy?: string;

	/**
	 * An absolute or a relative (wrt dest directory) directory to which to move the source files
	 */
	to: string;
}
