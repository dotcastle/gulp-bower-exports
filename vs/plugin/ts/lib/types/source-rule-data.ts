/**
 * Selects source files for processing
 */
interface ISourceRuleData extends IRuleData {
	/**
	 * One or more source glob patterns
	 */
	src: string;
}
