import Ember from 'ember';
import QUnit from 'qunit';

const {
  addObserver,
  removeObserver
} = Ember;

function makeCounter() {
  let count = 0;
  const counter = Object.create(null);
  counter.reset = function resetCounter() { count = 0; };

  Object.defineProperty(counter, 'count', {
    get() { return count; },
    set() {},
    configurable: false,
    enumerable: true
  });

  Object.freeze(counter);

  function increment() {
    count++;
  }

  return { counter, increment };
}

export function watchProperty(obj, propertyName) {
  let { counter, increment } = makeCounter();

  function observe() {
    increment();
  }

  addObserver(obj, propertyName, observe);

  function unwatch() {
    removeObserver(obj, propertyName, observe);
  }

  return { counter, unwatch };
}

QUnit.assert.watchedPropertyCount = function assertWatchedPropertyCount(watcher, expectedCount, label) {
  this.pushResult(watcher.counter.count === expectedCount, watcher.counter.count, expectedCount, label);
};

QUnit.assert.dirties = function assertDirties(options, updateMethodCallback, label) {
  let { object: obj, property, count } = options;
  count = typeof count === 'number' ? count : 1;
  let { counter, unwatch } = watchProperty(obj, property);
  updateMethodCallback();
  this.pushResult(counter.count === count, counter.count, count, label);
  unwatch();
};

