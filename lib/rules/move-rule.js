var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var path = require('path');
var Enumerable = require('linq');
var LogType = require('../types/log-type');
var Logger = require('../logger');
var Rule = require('./rule');
var Utils = require('../utils');
var HierarchyAdjustment = require('../types/hierarchy-adjustment');
/**
 * Move Rule
 */
var MoveRule = (function (_super) {
    __extends(MoveRule, _super);
    /**
     * Constructor
     */
    function MoveRule(ruleData) {
        // Adjust
        ruleData = ruleData || {};
        // Base
        _super.call(this, ruleData);
        // This
        this._to = Utils.trimAdjustString(ruleData.to, null, null, null, null);
        this._hierarchyAdjustment = Utils.adjustEnumValue(ruleData.withHierarchy, HierarchyAdjustment.None, HierarchyAdjustment, false);
    }
    /**
     * Valid
     */
    MoveRule.prototype.checkValid = function (log, exportNameForLog) {
        var isValid = _super.prototype.checkValid.call(this, true, exportNameForLog);
        if (!this._to) {
            isValid = false;
            if (log) {
                Logger.log(LogType.Error, 'Invalid property - to {0}', this.getLogMessageContextInfo(exportNameForLog));
            }
        }
        return isValid;
    };
    /**
     * Returns this rule's stream
     * @param context - Context data
     */
    MoveRule.prototype.createStream = function (context) {
        // Clear
        context.transformContext.moveFiles = [];
        // Transform
        var transform = Utils.createTransform(Utils.proxy(this.transformObjects, this), Utils.proxy(this.flushObjects, this), context);
        transform['name'] = context.transformContext.exportInstance.name + ' - ' + context.transformContext.packageName + ' - MOVE';
        return transform;
    };
    /**
     * Collects the paths of the objects
     */
    MoveRule.prototype.transformObjects = function (transform, file, encoding, context) {
        Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
        if (!file.isDirectory()) {
            var hierarchyAdjustment = Utils.adjustEnumValue(context.transformContext.hierarchyAdjustment, this._hierarchyAdjustment, HierarchyAdjustment, false);
            if (hierarchyAdjustment === HierarchyAdjustment.None) {
                var to = context.executionContext.replacePackageToken(this._to, (context.transformContext.exportInstance.overridingMovePackageName !== null)
                    ? context.transformContext.exportInstance.overridingMovePackageName
                    : context.transformContext.packageName, true);
                Utils.setFilePath(file, path.join(to, file.relative));
                transform.push(file);
            }
            else if (hierarchyAdjustment === HierarchyAdjustment.Flattened) {
                var to = context.executionContext.replacePackageToken(this._to, (context.transformContext.exportInstance.overridingMovePackageName !== null)
                    ? context.transformContext.exportInstance.overridingMovePackageName
                    : context.transformContext.packageName, true);
                Utils.setFilePath(file, path.join(to, path.basename(file.relative)));
                transform.push(file);
            }
            else {
                context.transformContext.moveFiles.push(file);
            }
        }
        return Utils.resolvedPromise();
    };
    /**
     * Pushes the objects
     */
    MoveRule.prototype.flushObjects = function (transform, context) {
        // If not minimized, return
        var hierarchyAdjustment = Utils.adjustEnumValue(context.transformContext.hierarchyAdjustment, this._hierarchyAdjustment, HierarchyAdjustment, false);
        if (hierarchyAdjustment !== HierarchyAdjustment.Minimized) {
            return Utils.resolvedPromise();
        }
        // Adjust Hierarchy
        var commonPathSegment = Utils.findCommonSegment(Enumerable.from(context.transformContext.moveFiles)
            .select(function (f) { return path.dirname(f.relative); }).toArray());
        // Rebase all files
        Enumerable.from(context.transformContext.moveFiles)
            .forEach(function (f) { return Utils.removeCommonPathSegment(f, commonPathSegment); });
        // Move to
        var to = context.executionContext.replacePackageToken(this._to, (context.transformContext.exportInstance.overridingMovePackageName !== null)
            ? context.transformContext.exportInstance.overridingMovePackageName
            : context.transformContext.packageName, true);
        Enumerable.from(context.transformContext.moveFiles)
            .forEach(function (f) { return Utils.setFilePath(f, path.join(to, f.relative)); });
        // Now write the files
        return Utils.pushFiles(transform, context.transformContext.moveFiles);
    };
    return MoveRule;
})(Rule);
module.exports = MoveRule;
