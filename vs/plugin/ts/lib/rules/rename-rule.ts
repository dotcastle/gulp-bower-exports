import stream = require('stream');
import path = require('path');
import Q = require('q');
import File = require('vinyl');
import Enumerable = require('linq');
import LogType = require('../types/log-type');
import Logger = require('../logger');
import FileNamePart = require('../types/file-name-part');
import RuleType = require('../types/rule-type');
import Rule = require('./rule');
import FilterRule = require('./filter-rule');
import Utils = require('../utils');
import Export = require('../export');
import ExecutionContext = require('../execution-context');
import TransformContext = require('../transform-context');
import ContextTuple = require('../types/context-tuple');

/**
 * Rename Rule
 */
class RenameRule extends Rule {
	private _if: string;
	private _replace: string;
	private _in: FileNamePart;
	private _with: string;
	private _filters: FilterRule[];

	/**
	 * Constructor
	 */
	constructor(ruleData: IRenameRuleData) {
		// Adjust
		ruleData = ruleData || <IRenameRuleData>{};

		// Base
		super(ruleData);

		// This
		this._if = Utils.trimAdjustString(ruleData.if, null, null, null, null);
		this._replace = Utils.trimAdjustString(ruleData.replace, null, null, null, null);
		this._in = Utils.adjustEnumValue(ruleData.in, FileNamePart.FileName, FileNamePart, false);
		this._with = Utils.trimAdjustString(ruleData.with, null, null, null, '');
		this._filters = null;
	}

	/**
	 * Valid
	 */
	public checkValid(log?: boolean, exportNameForLog?: string): boolean {
		var isValid = super.checkValid(true, exportNameForLog);
		if (this._with === null) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'Invalid property - with {0}', this.getLogMessageContextInfo(exportNameForLog));
			}
		}
		return isValid;
	}

	/**
	 * Resolves sources
	 * @param exportInstance - Export directive instance
	 * @param executionContext - Execution context
	 */
	public resolve(exportInstance: Export, executionContext: ExecutionContext): Q.Promise<any> {
		if (this._if !== null) {
			var filter: any = Utils.trimAdjustString(this._if, null, null, null, '');
			filter = (filter || '').split(',');
			filter = Enumerable.from(filter).distinct().toArray();
			try {
				this._filters = Utils.ensureArray(filter, s => {
					s = Utils.trimAdjustString(s, null, null, null, null);
					if (!s) {
						return undefined;
					}

					if (s.indexOf('#') === 0) {
						return executionContext.resolveRule<FilterRule>(s.substr(1), RuleType.Filter) || undefined;
					}
					var rule = new FilterRule({
						id: Utils.generateUniqueRuleId(RuleType.Filter),
						type: RuleType[RuleType.Filter].toLowerCase(),
						fullnameLike: s
					});
					if (!rule.checkValid(true, exportInstance.name)) {
						throw new Error();
					}
					return rule;
				}) || [];
			} catch (e) {
				return Utils.rejectedPromise();
			}
		}
		return Utils.resolvedPromise();
	}

	/**
	 * Returns this rule's stream
	 * @param context - Context data
	 */
	public createStream(context: ContextTuple): NodeJS.ReadWriteStream {
		return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
	}

	/**
	 * Transform
	 */
	private transformObjects(transformStream: stream.Transform, file: File, encoding: string, context: ContextTuple): Q.Promise<any> {
		Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));

		// Filter
		if (this._filters && this._filters.length
			&& Enumerable.from(this._filters).any(f => !f.test(file, context))) {
			return Utils.pushFiles(transformStream, [file]);
		}

		// Rename
		var replace = this._replace
			? Utils.toRegExp(context.executionContext.replacePackageToken(this._replace, context.transformContext.packageName), true)
			: new RegExp('^.*$', 'g');
		var withText = context.executionContext.replacePackageToken(this._with, context.transformContext.packageName);

		if (this._in === FileNamePart.FullName) {
			let name = file.relative;
			name = name.replace(replace, withText);
			Utils.setFilePath(file, name);
		} else if (this._in === FileNamePart.DirName) {
			let name = path.dirname(file.relative);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(name, path.basename(file.relative)));
		} else if (this._in === FileNamePart.FileName) {
			let name = path.basename(file.relative);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), name));
		} else if (this._in === FileNamePart.BaseName) {
			let extname = path.extname(file.relative);
			let name = path.basename(file.relative, extname);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), name + extname));
		} else if (this._in === FileNamePart.ExtName) {
			let extname = path.extname(file.relative);
			let name = extname;
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), path.basename(file.relative, extname) + name));
		}

		// Push
		return Utils.pushFiles(transformStream, [file]);
	}
}
export = RenameRule;