import { test } from 'qunit';
import { default as moduleFor }  from 'ember-qunit/module-for';
import sinon from 'sinon';

import Ember from 'ember';

import SchemaManager from 'ember-m3/schema-manager';
import { initialize as initializeStore } from 'ember-m3/initializers/m3-store';

const { get, run, RSVP: { Promise, } } = Ember;

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

      computeAttributeReference() {
        return null;
      },

      isAttributeArrayReference() {
        return false;
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
        'com.example.projections.CompactPerson': {
          projects: 'com.example.models.Person',
          attributes: [ 'name' ],
        },
      },
    });

    let projectionCache = Object.create(null);

    let baseAdapter = this.adapter();
    let superReloadRecord = baseAdapter.shouldReloadRecord;
    baseAdapter.shouldReloadRecord = function shouldReloadProjection(store, snapshot) {
      if (!snapshot.adapterOptions || !snapshot.adapterOptions.projectionName) {
        return superReloadRecord.apply(this, arguments);
      }
      let cacheKey = `${snapshot.adapterOptions.projectionName}:${snapshot.id}`;
      if (cacheKey in projectionCache) {
        return false;
      }
      return true;
    };

    let superFindRecord = baseAdapter.findRecord;
    baseAdapter.findRecord = function projectionFindRecord(store, modelClass, id, snapshot) {
      let foundRecord = superFindRecord.apply(this, arguments);
      if (!snapshot.adapterOptions || !snapshot.adapterOptions.projectionName) {
        return foundRecord;
      }
      return foundRecord.then((payload) => {
        // TODO Scan all inputs
        let id = payload.data.id;
        payload.data.projectionTypes.forEach((typeName) => {
          let cacheKey = `${typeName}:${id}`;
          projectionCache[cacheKey] = true;
        });
        return payload;
      });
    }
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

  let ajaxSpy = this.sinon.stub(this.adapter(), 'ajax').returns(Promise.resolve(initialPayload, PersonTypeName));

  let store = this.store();
  run(() => {
    store.findRecord('com.example.models.Person', '1');
  });

  ajaxSpy.reset();
  ajaxSpy.returns(Promise.resolve(overrideType(initialPayload, CompactPersonTypeName)));

  run(() => {
    store.findRecord('com.example.projections.CompactPerson', '1')
      .then((record) => {
        assert.equal(get(record, 'description'), null);
        assert.equal(get(record, 'name'), 'Tom Dale');
        assert.ok(ajaxSpy.calledOnce);
      });
  });

  run(() => {
    store.findRecord('com.example.projections.CompactPerson', '1')
      .then(() => {
        // Second request for the same projection should correctly be cached
        assert.ok(ajaxSpy.calledOnce);
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

