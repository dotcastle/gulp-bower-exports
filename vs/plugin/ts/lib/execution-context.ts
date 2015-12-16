import stream = require('stream');
import path = require('path');
import Q = require('q');
import File = require('vinyl');
var multistream = <Function>require('multistream');
import Enumerable = require('linq');
import Utils = require('./utils');
import LogType = require('./types/log-type');
import Logger = require('./logger');
import Constants = require('./constants');
import RuleType = require('./types/rule-type');
import Rule = require('./rules/rule');
import SourceRule = require('./rules/source-rule');
import FilterRule = require('./rules/filter-rule');
import RenameRule = require('./rules/rename-rule');
import ReplaceContentRule = require('./rules/replace-content-rule');
import MoveRule = require('./rules/move-rule');
import Export = require('./export');

/**
 * Execution context
 */
class ExecutionContext {
	public options: IPluginOptions;
	public packageNames: string[];
	public rules: Rule[];
	public exports: Export[];
	public bowerComponentsDirectory: string;
	public packageMainFiles: { [key: string]: string[] };
	private _streamFactoryQueue: IStreamCreationData[];

	/**
	 * Initialization
	 */
	public initialize(transform: stream.Transform, file: File, encoding: string): Q.Promise<any> {
		Logger.log(LogType.Information, 'Reading bower.json contents...');
		return Utils.streamToBuffer(file.contents)
			// Parse File contents as JSON
			.then(buffer => { return Utils.parseJson(buffer); })

			// Check bower_comonents directory
			.then((bowerJson: IBowerJsonData) => {
				// Check if .bowerrc exists in the bower.json location
				var bowerRcPath = path.join(path.dirname(file.path), '.bowerrc');
				bowerRcPath = path.resolve(process.cwd(), bowerRcPath);
				return Utils.readJson(bowerRcPath)
					.then((rc: IBowerRcData) => { return Utils.fileOrDirectoryExists(path.join(path.dirname(file.path), rc.directory)); })
					.then((bowerCompsDir: string) => { return Utils.resolvedPromise({ dir: path.relative(process.cwd(), bowerCompsDir), json: bowerJson }); })
					.catch(e => {
						Logger.log(LogType.Warning, '.bowerrc file does not exist or could not be read');
						return Utils.resolvedPromise({ dir: null, json: bowerJson });
					});
			})
			.then((d: { dir: string, json: IBowerJsonData }) => {
				if (d.dir) {
					return Utils.resolvedPromise(d);
				}
				else {
					var dir = path.join(path.dirname(file.path), 'bower_components');
					return Utils.fileOrDirectoryExists(dir)
						.then((bowerCompsDir: string) => { return Utils.resolvedPromise({ dir: path.relative(process.cwd(), bowerCompsDir), json: d.json }); })
						.catch(e => { return Utils.rejectedPromise(new Error('Failed to resolve bower_components directory')); });
				}
			})
			.then((d: { dir: string, json: IBowerJsonData }) => {
				// Save
				this.bowerComponentsDirectory = d.dir;
				var bowerJson = d.json;
				Logger.log(LogType.Information, 'Resolved bower_components directory - ' + d.dir);

				// Log
				Logger.log(LogType.Information, 'Analyzing bower.json contents...');

				// Get all package names
				this.packageNames = Enumerable.from(Utils.getProperties(bowerJson.dependencies))
					.select((p: IKeyValuePair<string, any>) => { return Utils.trimAdjustString(p.key, null, null, null, null); })
					.where((p: string) => !!p)
					.toArray();

				// Reject if no package names
				if (this.packageNames.length === 0) {
					Logger.log(LogType.Warning, 'No packages found in the bower.json (path: \'{0}\')', file.path);
					return Utils.rejectedPromise();
				}
				// Check external exports file
				if (this.options.exportsJsonFilePath) {
					Logger.log(LogType.Information, 'Reading bower exports contents from {0}...', this.options.exportsJsonFilePath);
					return Utils.readJson(this.options.exportsJsonFilePath);
				} else if (bowerJson.bowerExports) {
					Logger.log(LogType.Information, 'Reading embedded bower exports contents...');
					return Utils.resolvedPromise(bowerJson.bowerExports);
				} else {
					return Utils.rejectedPromise(new Error('Bower Exports section not found'));
				}
			})

			// Process Rules & Directives
			.then((b: IBowerExportsData) => {
				// Log
				Logger.log(LogType.Information, 'Analyzing global rules...');

				// Create rules
				this.rules = Utils.ensureArray(b.rules, r => {
					// Check if we have the rule
					if (!r) {
						return undefined;
					}

					// Analyze the rule type
					var ruleType = Utils.adjustEnumValue(r.type, null, RuleType, false);
					if (ruleType === null) {
						Logger.log(LogType.Warning, 'Invalid rule type ({0})', r);
						return undefined;
					}

					try {
						// Create rule
						if (ruleType === RuleType.Source) {
							var sourceRule = new SourceRule(<ISourceRuleData>r);
							return sourceRule.checkValid(true) ? sourceRule : undefined;
						}
						else if (ruleType === RuleType.Filter) {
							var nameFilterRule = new FilterRule(<IFilterRuleData>r);
							return nameFilterRule.checkValid(true) ? nameFilterRule : undefined;
						}
						else if (ruleType === RuleType.Rename) {
							var renameRule = new RenameRule(<IRenameRuleData>r);
							return renameRule.checkValid(true) ? renameRule : undefined;
						}
						else if (ruleType === RuleType.ReplaceContent) {
							var replaceContentRule = new ReplaceContentRule(<IReplaceContentRuleData>r);
							return replaceContentRule.checkValid(true) ? replaceContentRule : undefined;
						}
						else if (ruleType === RuleType.Move) {
							var moveRule = new MoveRule(<IMoveRuleData>r);
							return moveRule.checkValid(true) ? moveRule : undefined;
						}
					}
					catch (e) {
						Logger.log(LogType.Warning, 'Rule instance could not be created (src: \'{0}\', reason: \'{1}\')', r, e);
					}
					return undefined;
				});
				if ((this.rules === null) || (this.rules.length === 0)) {
					return Utils.rejectedPromise(new Error('No valid rules present in the bower exports'));
				}

				// Check for duplicate ids
				var rulesEnum = Enumerable.from(this.rules);
				var typeGroups = rulesEnum.groupBy(r => r.type);
				var duplicatesFound = false;
				Logger.log(LogType.Debug, 'Analyzing duplicate rule ids...');
				typeGroups.forEach(g => {
					Enumerable.from(g).forEach((r, i) => {
						var loggedIds = {};
						Enumerable.from(g).forEach((r1, i1) => {
							if ((r.id === r1.id) && (i !== i1)) {
								duplicatesFound = true;
								if (!loggedIds[r.id]) {
									Logger.log(LogType.Error, 'Duplicate rule id found (id: \'{0}\', type: \'{1}\')', r.id, RuleType[g.key()]);
								}
								loggedIds[r.id] = true;
							}
						});
					});
				});
				if (duplicatesFound) {
					return Utils.rejectedPromise();
				}

				// Default & Include Rules
				var defaultExportRules = b.defaultExportRules || {};
				defaultExportRules.source = Utils.trimAdjustString(defaultExportRules.source, null, null, null, null);
				defaultExportRules.filter = Utils.trimAdjustString(defaultExportRules.filter, null, null, null, null);
				defaultExportRules.rename = Utils.trimAdjustString(defaultExportRules.rename, null, null, null, null);
				defaultExportRules.replaceContent = Utils.trimAdjustString(defaultExportRules.replaceContent, null, null, null, null);
				defaultExportRules.move = Utils.trimAdjustString(defaultExportRules.move, null, null, null, null);
				defaultExportRules.hierarchyAdjustment = Utils.trimAdjustString(defaultExportRules.hierarchyAdjustment, null, null, null, null);

				var appendExportRules = b.appendExportRules || {};
				appendExportRules.source = Utils.trimAdjustString(appendExportRules.source, null, null, null, null);
				appendExportRules.filter = Utils.trimAdjustString(appendExportRules.filter, null, null, null, null);
				appendExportRules.rename = Utils.trimAdjustString(appendExportRules.rename, null, null, null, null);
				appendExportRules.replaceContent = Utils.trimAdjustString(appendExportRules.replaceContent, null, null, null, null);

				// Create Export Objects
				Logger.log(LogType.Information, 'Analyzing export directives...');
				var exportNameIndex = 1;
				this.exports = Utils.ensureArray(b.exports, x => {
					if (!x) {
						return undefined;
					}
					var defaultExportName = 'Export - ' + exportNameIndex;
					exportNameIndex += 1;
					x.name = Utils.trimAdjustString(x.name, defaultExportName, defaultExportName, defaultExportName, defaultExportName);
					var xObj = Export.create(x, defaultExportRules, appendExportRules, this);
					return xObj || undefined;
				});
				if ((this.exports === null) || (this.exports.length === 0)) {
					return Utils.rejectedPromise(new Error('No valid exports present in the bower exports'));
				}

				// Return
				return Utils.resolvedPromise();
			})

			// Resolve all exports
			.then(() => {
				// Resolve all export rule src
				Logger.log(LogType.Information, 'Resolving export directive sources...');
				this.packageMainFiles = {};
				return Q.all(Enumerable.from(this.exports).select(x => x.resolve(this)).toArray());
			})

			// Transform
			.then(() => {
				// Log
				Logger.log(LogType.Information, 'Beginning transformations...');

				// Push the file & finish
				if (this.options.emitBowerJsonFile) {
					Utils.pushFiles(transform, [file]);
				}

				// Stream Export Streams
				this._streamFactoryQueue = null;
				var exportsStream = multistream(Utils.proxy(this.exportsStreamFactory, this), { objectMode: true, highWaterMark: Constants.transformStreamReadableHighWaterMark });

				// We are done when exportsStream is done
				return Utils.transferFiles(exportsStream, transform);
			})
			.catch(e => {
				// Log
				if (e) {
					Logger.log(LogType.Error, 'Initialization failed (src: \'{0}\', reason: \'{1}\')', file.path, e);
				}

				// Return
				return Utils.rejectedPromise();
			});
	}

	/**
	 * Returns the rule instance
	 * @param id - Id of the rule
	 * @param ruleType - Rule type
	 * @returns {TRule} - Rule instance
	 */
	public resolveRule<TRule extends Rule>(id: string, ruleType: RuleType): TRule {
		return <TRule>Enumerable.from(this.rules)
					.singleOrDefault(r => (r.type === ruleType) && (r.id === id));
	}

	/**
	 * Replaces package token iin the given string
	 * @param str - String to replace in
	 * @param isPathString - Whether the specified string is a path segment
	 * @param packageNameOverride - Override for package name
	 * @returns {string} - Replaced string
	 */
	public replacePackageToken(str: string, packageName: string, isPathString: boolean = false): string {
		if (!Utils.isType(str, String)) {
			return str;
		}
		var packageName = Utils.isType(packageName, String) ? packageName : '';
		str = str.replace(Constants.packageNameTokenRegex, packageName);
		if (isPathString) {
			str = path.normalize(str).replace(/\\/g, '/');
		}
		return str;
	}

	/**
	 * Creates streams on demand
	 * @param callback - Callback to return the streams
	 */
	private exportsStreamFactory(callback: (e: any, stream: NodeJS.ReadableStream) => void): void {
		if (this._streamFactoryQueue === null) {
			this._streamFactoryQueue = [];
			Enumerable.from(this.exports).forEach(x => {
				Enumerable.from(x.packageNames).forEach((p, i) => {
					this._streamFactoryQueue.push({ exportInstance: x, packageName: p, isFirstPackageForExport: (i === 0) });
				});
			});
		}
		if (this._streamFactoryQueue.length === 0) {
			// No more exports end
			Logger.log(LogType.Information, 'Finished processing all exports');
			callback(null, null);
			return;
		}

		var creationData = this._streamFactoryQueue.shift();
		var exportInstance = <Export>(creationData.exportInstance);
		var nextStream = exportInstance.createStream(creationData.packageName, this);
		if (!nextStream) {
			callback(new Error('An unknown error has occurred while creating stream ' + exportInstance.getLogMessageContextInfo({ package: creationData.packageName })), null);
		} else {
			if (creationData.isFirstPackageForExport) {
				Logger.log(LogType.Information, 'Processing {0}', exportInstance.getLogMessageContextInfo());
			}
			Logger.log(LogType.Debug, 'Processing {0}', exportInstance.getLogMessageContextInfo({ package: creationData.packageName }));
			callback(null, nextStream);
		}
	}
}
export = ExecutionContext;