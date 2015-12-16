/**
 * Rule type
 */
var RuleType;
(function (RuleType) {
    RuleType[RuleType["Source"] = 0] = "Source";
    RuleType[RuleType["Filter"] = 1] = "Filter";
    RuleType[RuleType["Rename"] = 2] = "Rename";
    RuleType[RuleType["ReplaceContent"] = 3] = "ReplaceContent";
    RuleType[RuleType["Move"] = 4] = "Move";
    RuleType[RuleType["CheckChanges"] = 5] = "CheckChanges";
})(RuleType || (RuleType = {}));
module.exports = RuleType;
