

// 1.

function getUnique(arrIn) {
  var i, k, l = arrIn.length, arrOut = [];
  for (i = 0; i < l; i++) {
    for (k = i + 1; k < l; k++) {
      if (arrIn[i] === arrIn[k]) {
        k = ++i;
      }
    }
    arrOut.push(arrIn[i]);
  }
  return arrOut;
}

// 2.

function multiply(arg) {
  var result = arg;
  var calc = function (arg) {
    result *= arg;
    return calc;
  };
  calc.toString = function () {
    return result;
  };
  return calc;
}
