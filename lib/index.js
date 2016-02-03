'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.optimistic = exports.ensureState = exports.REVERT = exports.COMMIT = exports.BEGIN = undefined;

var _immutable = require('immutable');

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

var BEGIN = exports.BEGIN = '@@optimist/BEGIN';
var COMMIT = exports.COMMIT = '@@optimist/COMMIT';
var REVERT = exports.REVERT = '@@optimist/REVERT';

var ensureState = exports.ensureState = function ensureState(state) {
  if (_immutable.Map.isMap(state)) {
    if (_immutable.List.isList(state.get('history'))) {
      return state.get('current');
    }
  }
  return state;
};

var applyCommit = function applyCommit(state, commitId, reducer) {
  var history = state.get('history');
  // If the action to commit is the first in the queue (most common scenario)
  if (history.first().meta.optimistic.id === commitId) {
    var _ret = (function () {
      var historyWithoutCommit = history.shift();
      var nextOptimisticIndex = historyWithoutCommit.findIndex(function (action) {
        return action.meta && action.meta.optimistic && action.meta.optimistic.id;
      });
      // If this is the only optimistic item in the queue, we're done!
      if (nextOptimisticIndex === -1) {
        return {
          v: state.withMutations(function (mutState) {
            mutState.set('history', (0, _immutable.List)()).set('beforeState', undefined);
          })
        };
      }
      // Create a new history starting with the next one
      var newHistory = historyWithoutCommit.skip(nextOptimisticIndex);
      // And run every action up until that next one to get the new beforeState
      var newBeforeState = history.reduce(function (mutState, action, index) {
        return index <= nextOptimisticIndex ? reducer(mutState, action) : mutState;
      }, state.get('beforeState'));
      return {
        v: state.withMutations(function (mutState) {
          mutState.set('history', newHistory).set('beforeState', newBeforeState);
        })
      };
    })();

    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
  } else {
    // If the committed action isn't the first in the queue, find out where it is
    var actionToCommit = history.findEntry(function (action) {
      return action.meta && action.meta.optimistic && action.meta.optimistic.id === commitId;
    });
    if (!actionToCommit) {
      console.error('@@optimist: Failed commit. Transaction #' + commitId + ' does not exist!');
    }
    // Make it a regular non-optimistic action
    var newAction = Object.assign({}, actionToCommit[1], {
      meta: Object.assign({}, actionToCommit[1].meta, { optimistic: null })
    });
    return state.set('history', state.get('history').set(actionToCommit[0], newAction));
  }
};

var applyRevert = function applyRevert(state, revertId, reducer) {
  var history = state.get('history');
  var beforeState = state.get('beforeState');
  var newHistory = undefined;
  var newBeforeState = undefined;
  // If the action to revert is the first in the queue (most common scenario)
  if (history.first().meta.optimistic.id === revertId) {
    var _ret2 = (function () {
      var historyWithoutRevert = history.shift();
      var nextOptimisticIndex = historyWithoutRevert.findIndex(function (action) {
        return action.meta && action.meta.optimistic && action.meta.optimistic.id;
      });
      // If this is the only optimistic action in the queue, we're done!
      if (nextOptimisticIndex === -1) {
        return {
          v: state.withMutations(function (mutState) {
            mutState.set('history', (0, _immutable.List)()).set('current', historyWithoutRevert.reduce(function (mutState, action) {
              return reducer(mutState, action);
            }, beforeState)).set('beforeState', undefined);
          })
        };
      }
      newHistory = historyWithoutRevert.skip(nextOptimisticIndex);
      newBeforeState = beforeState;
    })();

    if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
  } else {
    var indexToRevert = history.findIndex(function (action) {
      return action.meta && action.meta.optimistic && action.meta.optimistic.id === revertId;
    });
    if (indexToRevert === -1) {
      console.error('@@optimist: Failed revert. Transaction #' + revertId + ' does not exist!');
    }
    newHistory = history.delete(indexToRevert);
    newBeforeState = beforeState;
  }
  var newCurrent = newHistory.reduce(function (mutState, action) {
    return reducer(mutState, action);
  }, beforeState);
  return state.withMutations(function (mutState) {
    mutState.set('history', newHistory).set('current', newCurrent).set('beforeState', newBeforeState);
  });
};

var optimistic = exports.optimistic = function optimistic(reducer) {
  var rawConfig = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var config = Object.assign({
    maxHistory: 100
  }, rawConfig);
  var isReady = false;

  return function (state, action) {
    if (!isReady || state === undefined) {
      isReady = true;
      state = (0, _immutable.Map)({
        history: (0, _immutable.List)(),
        current: reducer(ensureState(state), {}),
        beforeState: undefined
      });
    }
    var historySize = state.get('history').size;
    var metaAction = action.meta && action.meta.optimistic || {};
    var type = metaAction.type;
    var id = metaAction.id;

    if (type === BEGIN && historySize) {
      // Don't save a second state
      type = null;
    }
    switch (type) {
      case BEGIN:
        return state.withMutations(function (mutState) {
          mutState.set('history', state.get('history').push(action)).set('current', reducer(state.get('current'), action)).set('beforeState', state.get('current'));
        });
      case COMMIT:
        return applyCommit(state, id, reducer);
      case REVERT:
        return applyRevert(state, id, reducer);
      default:
        if (historySize) {
          if (historySize > config.maxHistory) {
            console.error('@@optimist: Possible memory leak detected.\n              Verify all actions result in a commit or revert and\n              don\'t use optimistic-UI for long-running server fetches');
          }
          return state.withMutations(function (mutState) {
            mutState.set('history', state.get('history').push(action)).set('current', reducer(state.get('current'), action));
          });
        }
        return state.set('current', reducer(state.get('current'), action));
    }
  };
};