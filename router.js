var _ = require('underscore');
var url = require('url')
var fs = require('fs-extra');
var path = require('path');
var fs = require('fs-extra');
var settings  = require('./public/settings'),
	moment = require('moment'),
  merge = require('merge'),
  parsedown = require('woods-parsedown'),
  formidable = require('formidable'),
  main = require('./main'),
	flags = require('flags'),
  gutil = require('gulp-util')
;

module.exports = function(app,io,m){

  /**
  * routing event
  */
  app.get("/", getIndex);
  app.get("/:conf", getConf);
  app.post("/:conf/file-upload", postFile2);

  /**
  * routing functions
  */

  // GET
  function getIndex(req, res) {
    var pageTitle = "Baking Projects";
    // console.log(req);
    res.render("index", {title : pageTitle});
  };

  function getConf(req, res) {
    var pageTitle = "Diapo.js";
    res.render("conf", {title : pageTitle, "slugConfName": req.param('conf')});
    // res.render("index", {title : pageTitle});
  };

  function postFile2(req, res){
    console.log('Will add new media for conf ' + req.param('conf'));
    var slugConfName = req.param('conf');

    // create an incoming form object
    var form = new formidable.IncomingForm();

    // specify that we want to allow the user to upload multiple files in a single request
    form.multiples = true;

    // store all uploads in the conf directory
    form.uploadDir = path.join(__dirname, settings.contentDir, slugConfName);

    var allFilesMeta = {};

    // every time a file has been uploaded successfully,
    form.on('file', function(field, file) {
      console.log('File uploaded.');
      // rename it to it's original name prepended by a number
      findFirstFilenameNotTaken(form.uploadDir, file.name).then(function(newFileName){
        var newPathToNewFileName = path.join(form.uploadDir, newFileName);
        fs.rename(file.path, newPathToNewFileName);
        createMediaMeta( form.uploadDir, newFileName).then(function(fileMeta){
          allFilesMeta.push(fileMeta);
        }, function(err) {
          console.log(err);
          reject();
        });
      }, function(err) {
        console.log(err);
        reject();
      });

    });

    console.log('Checkup');

    // log any errors that occur
    form.on('error', function(err) {
      console.log('An error has occured: \n' + err);
    });

    // once all the files have been uploaded, send a response to the client
    form.on('end', function() {
      console.log('Finished packet, will send medias info : ' + JSON.stringify(allFilesMeta));
      var msg = {
        "msg" : "success",
        "medias" : JSON.stringify(allFilesMeta)
      }
      // not using those packets
      res.end(JSON.stringify(msg));
    });

    // parse the incoming request containing the form data
    form.parse(req);
  }

  function createMediaMeta(confPath, mediaFileName) {
    return new Promise(function(resolve, reject) {
      console.log( "Will create a new meta file for media " + mediaFileName + " for conf " + confPath);

//       var fileExtension = new RegExp( settings.regexpGetFileExtension, 'i').exec( mediaFileName)[0];
      var fileNameWithoutExtension = new RegExp( settings.regexpRemoveFileExtension, 'i').exec( mediaFileName)[1];

      var newMetaFileName = fileNameWithoutExtension + settings.metaFileext;
      var newPathToMeta = path.join(confPath, newMetaFileName);

      var mdata =
      {
        "name" : mediaFileName,
        "created" : getCurrentDate(),
        "modified" : getCurrentDate(),
        "informations" : "",
        "posX" : settings.startingPosX,
        "posY" : settings.startingPosY,
        "width" : 50,
        "height" : 50
      };
      dev.logverbose("Saving JSON string " + JSON.stringify(mdata, null, 4));
      storeData( newPathToMeta, mdata, 'create').then(function( meta) {
        console.log( "New media meta file created at path " + newPathToMeta);
        resolve( meta);
      }, function() {
        console.log( gutil.colors.red('--> Couldn\'t create media meta.'));
        reject( 'Couldn\'t create media meta');
      });
    });
  }


	function storeData( mpath, d, e) {
    return new Promise(function(resolve, reject) {
      console.log('Will store data');
      var textd = textifyObj(d);
      if( e === "create") {
        fs.appendFile( mpath, textd, function(err) {
          if (err) reject( err);
          resolve(parseData(textd));
        });
      }
		  if( e === "update") {
        fs.writeFile( mpath, textd, function(err) {
        if (err) reject( err);
          resolve(parseData(textd));
        });
      }
    });
	}
  function textifyObj( obj) {
    var str = '';
    dev.logverbose( '1. will prepare string for storage');
    for (var prop in obj) {
      var value = obj[prop];
      dev.logverbose('2. value ? ' + value);
      // if value is a string, it's all good
      // but if it's an array (like it is for medias in publications) we'll need to make it into a string
      if( typeof value === 'array') {
        value = value.join(', ');
      // check if value contains a delimiter
      } else if( typeof value === 'string' && value.indexOf('\n----\n') >= 0) {
        dev.logverbose( '2. WARNING : found a delimiter in string, replacing it with a backslash');
        // prepend with a space to neutralize it
        value = value.replace('\n----\n', '\n ----\n');
      }
      str += prop + ': ' + value + settings.textFieldSeparator;
//       dev.logverbose('Current string output : ' + str);
    }
//     dev.logverbose( '3. textified object : ' + str);
    return str;
  }

  function getCurrentDate() {
    return moment().format( settings.metaDateFormat);
  }
	function parseData(d) {
  	var parsed = parsedown(d);
		return parsed;
	}

  function findFirstFilenameNotTaken( confPath, fileName) {
    return new Promise(function(resolve, reject) {
      // let's find the extension
      var fileExtension = new RegExp( settings.regexpGetFileExtension, 'i').exec( fileName)[0];
      var fileNameWithoutExtension = new RegExp( settings.regexpRemoveFileExtension, 'i').exec( fileName)[1];
      dev.logverbose("Looking for existing file with name : " + fileNameWithoutExtension + " in confPath : " + confPath);
      try {
        var newFileName = fileNameWithoutExtension + fileExtension;
        var newMetaFileName = fileNameWithoutExtension + settings.metaFileext;
        var index = 0;
        var newPathToFile = path.join(confPath, newFileName);
        var newPathToMeta = path.join(confPath, newMetaFileName);

        dev.logverbose( "2. about to look for existing files.");
        // check si le nom du fichier et le nom du fichier méta sont déjà pris
        while( (!fs.accessSync( newPathToFile, fs.F_OK) && !fs.accessSync( newPathToMeta, fs.F_OK))){
          dev.logverbose("- - following path is already taken : newPathToFile = " + newPathToFile + " or newPathToMeta = " + newPathToMeta);
          index++;

          newFileName = fileNameWithoutExtension + "-" + index + fileExtension;
          newMetaFileName = fileNameWithoutExtension + "-" + index + settings.metaFileext;
          newPathToFile = path.join(confPath, newFileName);
          newPathToMeta = path.join(confPath, newMetaFileName);
        }
      } catch(err) {
      }
      dev.logverbose( "3. this filename is not taken : " + newFileName);
      resolve(newFileName);
    });
  }
};

var dev = (function() {
  // VARIABLES
  flags.defineBoolean('debug');
  flags.defineBoolean('verbose');
  flags.parse();

  var isDebugMode = flags.get('debug');
  var isVerbose = flags.get('verbose');

  return {
    init : function() {
      if(isDebugMode) {
        console.log('Debug mode is Enabled');
        console.log('---');
        dev.log('all functions are prepended with ~ ');
        dev.logpackets('(dev mode) green for sent packets');
        if(isVerbose) {
          dev.logverbose('(dev and verbose) gray for regular parsing data');
        }
      }
    },
    log : function(term) {
      if( isDebugMode)
        console.log(gutil.colors.blue('- ' + term));
    },
    logverbose : function(term) {
      if( isDebugMode && isVerbose)
        console.log(gutil.colors.gray('- ' + term));
    },
    logpackets : function(term) {
      if( isDebugMode)
        console.log(gutil.colors.green('- ' + term));
    },
    logfunction : function(term) {
      if( isDebugMode)
        console.info(gutil.colors.magenta('~ ' + term))
    }
  }
})();
dev.init();
