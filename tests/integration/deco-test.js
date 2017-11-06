import { test } from 'qunit';
import { default as moduleFor }  from 'ember-qunit/module-for';
import sinon from 'sinon';

import DS from 'ember-data';
import Ember from 'ember';
import { zip } from 'lodash';

import MegamorphicModel from 'ember-m3/model';
import SchemaManager from 'ember-m3/schema-manager';
import { initialize as initializeStore } from 'ember-m3/initializers/m3-store';

const { get, set, run, RSVP: { Promise, } } = Ember;

const UrnWithTypeRegex = /^urn:([a-zA-Z.]+):(.*)/;
const UrnWithoutTypeRegex = /^urn:(.*)/;

const PersonTypeName = 'com.example.models.Person';
const CompactPersonTypeName = 'com.example.projections.CompactPerson';

function overrideType(payload, type) {
  let newPayload = Ember.copy(payload, true);
  newPayload.data.projectionTypes = [].concat(type);
  return newPayload;
}

const initialPayload = {
  data: {
    id: '1',
    type: PersonTypeName,
    attributes: {
      name: 'Tom Dale',
      description: 'JavaScript thinkfluencer'
    }
  }
};


moduleFor('m3:store', 'integration/deco', {
  integration: true,

  beforeEach() {
    this.sinon = sinon.sandbox.create();
    initializeStore(this);

    SchemaManager.registerSchema({
      includesModel(modelName) {
        return /^com.example.models\./i.test(modelName) || /^com.example.projections\./i.test(modelName);
      },

      computeAttributeReference(key, value) {
        if (/^isbn:/.test(value)) {
          return {
            id: value,
            type: 'com.example.bookstore.Book',
          }
        } else if (UrnWithTypeRegex.test(value)) {
          let parts = UrnWithTypeRegex.exec(value);
          return {
            type: parts[1],
            id: parts[2],
          };
        } else if (UrnWithoutTypeRegex.test(value)) {
          return {
            type: null,
            id: value,
          };
        }
      },

      isAttributeArrayReference(key) {
        return key === 'otherBooksInSeries';
      },

      computeNestedModel(key, value) {
        if (value && typeof value === 'object' && value.constructor !== Date) {
          return {
            type: value.type,
            id: value.id,
            attributes: value,
          }
        }
      },

      models: {
      }
    });
  },

  afterEach() {
    this.sinon.restore();
  },

  store: function() {
    return this.container.lookup('service:store');
  },

  adapter: function() {
    return this.store().adapterFor('application');
  },
});

test('findRecord will issue a request for a projection, if it hasn\'t been fetched', function(assert) {
  assert.expect(4);

  let findRecordSpy = this.sinon.stub(this.adapter(), 'findRecord').returns(Promise.resolve(initialPayload, PersonTypeName));

  let store = this.store();
  run(() => {
    store.findRecord('com.example.models.Person', '1')
    .then(() => {
      findRecordSpy.reset();
      findRecordSpy.returns(Promise.resolve(overrideType(initialPayload, CompactPersonTypeName)));
      return store.findRecord('com.example.projections.CompactPerson', '1');
    })
    .then((record) => {
      assert.equal(get(record, 'description'), null);
      assert.equal(get(record, 'name'), 'Tom Dale');
      assert.ok(findRecordSpy.calledTwice);
    })
    .then(() => {
      return store.findRecord('com.example.projections.CompactPerson', '1');
    })
    .then(() => {
      // Second request for the same projection should correctly be cached
      assert.ok(findRecordSpy.calledTwice);
    });
  });
});

test('peekRecord will not return a projection, if it hasn\'t been fetched', function(assert) {
  assert.expect(0)
});

test('findRecord will update existing projetions', function(assert) {
  assert.expect(0)
});

test('set will update existing projections', function(assert) {
  assert.expect(0)
});

test('clients cannot access not white-listed properties in nested models', function(assert) {
  assert.expect(0)
});

