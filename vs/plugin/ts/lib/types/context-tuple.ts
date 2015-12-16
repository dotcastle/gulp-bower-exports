import ExecutionContext = require('../execution-context');
import TransformContext = require('../transform-context');

/**
 * Context tuple
 */
class ContextTuple {
	public executionContext: ExecutionContext;
	public transformContext: TransformContext;

	/**
	 * Constructor
	 */
	constructor(executionContext: ExecutionContext, transformContext: TransformContext) {
		this.executionContext = executionContext;
		this.transformContext = transformContext;
	}
}
export = ContextTuple;