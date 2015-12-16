/**
 * Rename rule
 */
interface IRenameRuleData extends IRuleData {
	/**
	 * Filter rule id(s)
	 */
	if?: string;

	/**
	 * Phrase or regex pattern to search in the file name
	 */
	replace?: string;

	/**
	 * Type of the file name part to replace in
	 */
	in?: string;

	/**
	 * Phrase or regex replacement string to replace with
	 */
	with: string;
}
