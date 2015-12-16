/**
 * Filters source files for further processing
 */
interface IFilterRuleData extends IRuleData {
	/**
	 * Matches the file's full name (full relative path).
	 * Can be a normal string or a regex expression
	 */
	fullnameLike?: string;

	/**
	 * Matches the file's relative directory name.
	 * Can be a normal string or a regex expression
	 */
	dirnameLike?: string;

	/**
	 * Matches the file's file name (base name and extension).
	 * Can be a normal string or a regex expression
	 */
	filenameLike?: string;

	/**
	 * Matches the file's base name (name without extension).
	 * Can be a normal string or a regex expression
	 */
	basenameLike?: string;

	/**
	 * Matches the file's full name (extension name including leading period).
	 * Can be a normal string or a regex expression
	 */
	extnameLike?: string;
}
