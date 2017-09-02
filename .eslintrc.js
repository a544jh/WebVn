module.exports = {
    "env": {
      "browser": true,
      "es6":true
    },
    "extends": "esnext",
    "rules" : {
      "semi" : "error",
      "no-console" : "off"
    },
    "globals" : {
      "createjs" : true
    },
    "settings" : {
      "import/ignore" : ["\.elm$"]
    }
};
