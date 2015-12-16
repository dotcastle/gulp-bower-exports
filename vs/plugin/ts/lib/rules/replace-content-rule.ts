import stream = require('stream');
import path = require('path');
import Q = require('q');
import gUtil = require('gulp-util');
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
 * ReplaceContent Rule
 */
class ReplaceContentRule extends Rule {
	private _if: string;
	private _replace: string;
	private _with: string;
	private _filters: FilterRule[];

	/**
	 * Constructor
	 */
	constructor(ruleData: IReplaceContentRuleData) {
		// Adjust
		ruleData = ruleData || <IReplaceContentRuleData>{};

		// Base
		super(ruleData);

		// This
		this._if = Utils.trimAdjustString(ruleData.if, null, null, null, null);
		this._replace = Utils.trimAdjustString(ruleData.replace, null, null, null, null);
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

		// Perform only if we have content
		if (!file.isNull()) {
			var originalContentIsBuffer = gUtil.isBuffer(file.contents);
			var replace = this._replace
				? Utils.toRegExp(context.executionContext.replacePackageToken(this._replace, context.transformContext.packageName), false)
				: new RegExp('^[\s\S]*$', 'g');
			var withText = context.executionContext.replacePackageToken(this._with, context.transformContext.packageName);

			// We need buffer to replace content
			return Utils.streamToBuffer(file.contents)
				.then(buffer => {
					try {
						// Get String
						var text = Utils.bufferToText(buffer);

						// Replace
						text = text.replace(replace, withText);
						buffer = new Buffer(text);

						// Set back
						if (originalContentIsBuffer) {
							file.contents = buffer;
						} else {
							file.contents = Utils.bufferToStream(buffer);
						}

						// Return
						transformStream.push(file);
						return Utils.resolvedPromise();
					} catch (e) {
						Logger.log(LogType.Error,
							'Failed to replace content (export: \'{0}\', package: \'{1}\', reason: \'{2}\')',
							context.transformContext.exportInstance.name, context.transformContext.packageName, e);
						return Utils.rejectedPromise();
					}
				});
		} else {
			// Push & skip
			transformStream.push(file);
			return Utils.resolvedPromise();
		}
	}
}
export = ReplaceContentRule;