# gulp-bower-exports #
A JSON driven rule based file transfer plugin for Gulp. For detailed information and usage, please visit [gulp-bower-exports](http://www.dotcastle.com/blog/gulp-bower-exports "gulp-bower-exports") 

When working with web applications, [bower](http://bower.io/ "Bower") is often a preferred choice to maintain client-side dependencies. While bower maintains the dependencies effectively, you do not often need the complete distribution files in your web project. The few required files from each distribution package need to be transferred either manually or by writing tedious scripts to do the task.

Grunt has a plugin to do this - [grunt-bower-task](https://github.com/yatskevich/grunt-bower-task "grunt-bower-task"). It transfers the key files from bower distributions to the target directory based on the specified configuration.

Gulp has a similar plugin - [main-bower-files](https://github.com/ck86/main-bower-files "main-bower-files"). This will read your bower.json, iterate through your dependencies and returns an array of files defined in the main property of the packages bower.json.

This plugin **gulp-bower-exports**, however provides a different approach to transfer the required files from your bower distributions to the target. The plugin is developed using TypeScript on Visual Studio 2015 and as such is easy to understand if you have worked with TypeScript earlier.

## Primary features ##
1. Simple JSON structure to describe the export tasks
2. Define simple rules that can be referenced in the export tasks
	- Source selection rule - Select source files using node glob patterns
	- Filter rule - Filter out from the selected sources
	- Rename rule - Rename parts of the file name (same as gulp-rename)
	- Replace Content rule - Replace file contents with regex search/replace
	- Move - Specify target locations to move the files
	- Check Changes - Filter out unchanged files (gulp-changed)
3. Export tasks composed using the inline or defined rules
4. JSON schema to help in editing the export configuration file

## Install ##
    $ npm install --save-dev gulp-bower-exports

## Usage ##
    var gulp = require('gulp');
    var bowerExports = require("gulp-bower-exports");

    gulp.task('default', function () {
	    return gulp.src('bower.json')
    		.pipe(bowerExports({ externalExportsJsonFilePath: 'bower-exports.json', checkChangesDestination: 'wwwroot' }))
    		.pipe(gulp.dest('wwwroot'));
    });

## API ##
### bowerExports(options) ###

#### options.cwd ####
**Type**: string  
**Required**: false  
**Default**: process.cwd()  
**Description**: Working directory  

#### options.externalExportsJsonFilePath ####
**Type**: string  
**Required**: false  
**Default**: null  
**Description**: External json file containing the exports section. If not specified, the exports section is expected to be present in the bower.json file with the property name "bowerExports"

#### options.bowerRcFilePath ####
**Type**: string  
**Required**: false  
**Default**: <bower.json directory>/.bowerrc  
**Description**: Path of the .bowerrc file relative to the bower.json file

#### options.bowerComponentsDirectory ####
**Type**: string  
**Required**: false  
**Default**: <bower.json directory>/bower_components  
**Description**: Path of the bower_components folder relative to the source file. This setting takes precedence over bowerRcFilePath.

#### options.passThroughSourceFiles ####
**Type**: boolean  
**Required**: false  
**Default**: false  
**Description**: Whether to remove the bower.json file itself from the processing pipe upon successful processing of its contents and adding them to the pipeline

#### options.nonReadableStreamedFiles ####
**Type**: boolean  
**Required**: false  
**Default**: false  
**Description**: Specify this flag to open the source files as non-readable. This option is directly passed to the gulp src method as option 'read'

#### options.checkChangesDestination ####
**Type**: string  
**Required**: false  
**Default**: null  
**Description**: The destination directory for gulp-changed. Same as you put into gulp.dest(). If not specified, change checking is not enabled.

## License ##
MIT © [DotCastle TechnoSolutions Private Limited, INDIA](http://www.dotcastle.com "DotCastle TechnoSolutions Private Limited, INDIA")
