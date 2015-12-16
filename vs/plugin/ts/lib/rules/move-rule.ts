import stream = require('stream');
import path = require('path');
import Q = require('q');
import File = require('vinyl');
import Enumerable = require('linq');
import LogType = require('../types/log-type');
import Logger = require('../logger');
import Rule = require('./rule');
import Utils = require('../utils');
import Export = require('../export');
import ExecutionContext = require('../execution-context');
import TransformContext = require('../transform-context');
import ContextTuple = require('../types/context-tuple');
import HierarchyAdjustment = require('../types/hierarchy-adjustment');

/**
 * Move Rule
 */
class MoveRule extends Rule {
	private _to: string;
	private _hierarchyAdjustment: HierarchyAdjustment;

	/**
	 * Constructor
	 */
	constructor(ruleData: IMoveRuleData) {
		// Adjust
		ruleData = ruleData || <IMoveRuleData>{};

		// Base
		super(ruleData);

		// This
		this._to = Utils.trimAdjustString(ruleData.to, null, null, null, null);
		this._hierarchyAdjustment = Utils.adjustEnumValue(ruleData.withHierarchy, HierarchyAdjustment.None, HierarchyAdjustment, false);
	}

	/**
	 * Valid
	 */
	public checkValid(log?: boolean, exportNameForLog?: string): boolean {
		var isValid = super.checkValid(true, exportNameForLog);
		if (!this._to) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'Invalid property - to {0}', this.getLogMessageContextInfo(exportNameForLog));
			}
		}
		return isValid;
	}

	/**
	 * Returns this rule's stream
	 * @param context - Context data
	 */
	public createStream(context: ContextTuple): NodeJS.ReadWriteStream {
		// Clear
		context.transformContext.moveFiles = [];

		// Transform
		var transform = Utils.createTransform(
			Utils.proxy(this.transformObjects, this),
			Utils.proxy(this.flushObjects, this),
			context);
		transform['name'] = context.transformContext.exportInstance.name + ' - ' + context.transformContext.packageName + ' - MOVE';
		return transform;
	}

	/**
	 * Collects the paths of the objects
	 */
	private transformObjects(transform: stream.Transform, file: File, encoding: string, context: ContextTuple): Q.Promise<any> {
		Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
		if (!file.isDirectory()) {
			var hierarchyAdjustment = Utils.adjustEnumValue(context.transformContext.hierarchyAdjustment, this._hierarchyAdjustment, HierarchyAdjustment, false);
			if (hierarchyAdjustment === HierarchyAdjustment.None) {
				let to = context.executionContext.replacePackageToken(this._to,
					(context.transformContext.exportInstance.overridingMovePackageName !== null)
						? context.transformContext.exportInstance.overridingMovePackageName
						: context.transformContext.packageName,
					true);
				Utils.setFilePath(file, path.join(to, file.relative));
				transform.push(file);
			} else if (hierarchyAdjustment === HierarchyAdjustment.Flattened) {
				let to = context.executionContext.replacePackageToken(this._to,
					(context.transformContext.exportInstance.overridingMovePackageName !== null)
						? context.transformContext.exportInstance.overridingMovePackageName
						: context.transformContext.packageName,
					true);
				Utils.setFilePath(file, path.join(to, path.basename(file.relative)));
				transform.push(file);
			} else {
				context.transformContext.moveFiles.push(file);
			}
		}
		return Utils.resolvedPromise();
	}

	/**
	 * Pushes the objects
	 */
	private flushObjects(transform: stream.Transform, context: ContextTuple): Q.Promise<any> {
		// If not minimized, return
		var hierarchyAdjustment = Utils.adjustEnumValue(context.transformContext.hierarchyAdjustment, this._hierarchyAdjustment, HierarchyAdjustment, false);
		if (hierarchyAdjustment !== HierarchyAdjustment.Minimized) {
			return Utils.resolvedPromise();
		}

		// Adjust Hierarchy
		var commonPathSegment = Utils.findCommonSegment(
			Enumerable.from(context.transformContext.moveFiles)
				.select(f => path.dirname(f.relative)).toArray());

		// Rebase all files
		Enumerable.from(context.transformContext.moveFiles)
			.forEach(f => Utils.removeCommonPathSegment(f, commonPathSegment));

		// Move to
		var to = context.executionContext.replacePackageToken(this._to,
			(context.transformContext.exportInstance.overridingMovePackageName !== null)
				? context.transformContext.exportInstance.overridingMovePackageName
				: context.transformContext.packageName,
			true);
		Enumerable.from(context.transformContext.moveFiles)
			.forEach(f => Utils.setFilePath(f, path.join(to, f.relative)));

		// Now write the files
		return Utils.pushFiles(transform, context.transformContext.moveFiles);
	}
}
export = MoveRule;