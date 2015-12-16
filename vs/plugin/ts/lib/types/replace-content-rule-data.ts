/**
 * Specifies criteria to replace contents of a file
 */
interface IReplaceContentRuleData extends IRuleData {
	/**
	 * Filter rule id(s)
	 */
	if?: string;

	/**
	 * Phrase or regex pattern to search in the file content
	 */
	replace?: string;

	/**
	 * Phrase or regex replacement string to replace with
	 */
	with: string;
}
