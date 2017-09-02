module.exports = {
    "env": {
      "browser": true,
      "es6":true
    },
    "extends": "esnext",
    "rules" : {
      "semi" : "error"
    },
    "globals" : {
      "createjs" : true
    },
    "settings" : {
      "import/ignore" : ["\.elm$"]
    }
};
