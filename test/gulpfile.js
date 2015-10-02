﻿var gulp = require('gulp');
var gulpDebug = require('gulp-debug');
var bowerExports = require("gulp-bower-exports");

gulp.task('default', function () {
	return gulp.src('bower.json')
		.pipe(bowerExports({ externalExportsJsonFilePath: 'bower-exports.json', checkChangesDestination: 'wwwroot' }))
		.pipe(gulp.dest('wwwroot'));
});

gulp.task('defaultWatch', function () {
	gulp.watch([
		'bower.json', 'bower-exports.json',
		'../bower_components/**/*.*'
	], ['default']);
});
