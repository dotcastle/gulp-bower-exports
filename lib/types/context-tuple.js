/**
 * Context tuple
 */
var ContextTuple = (function () {
    /**
     * Constructor
     */
    function ContextTuple(executionContext, transformContext) {
        this.executionContext = executionContext;
        this.transformContext = transformContext;
    }
    return ContextTuple;
})();
module.exports = ContextTuple;
