/**
 * Simple file info
 */
interface IFileInfo {
	cwd: string;
	base: string;
	path: string;
	relative: string;
	isBuffer: boolean;
	isStream: boolean;
	isNull: boolean;
	isDirectory: boolean;
}
