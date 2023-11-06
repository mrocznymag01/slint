// Copyright © SixtyFPS GmbH <info@slint.dev>
// SPDX-License-Identifier: GPL-3.0-only OR LicenseRef-Slint-Royalty-free-1.1 OR LicenseRef-Slint-commercial

import test from 'ava'
const path = require('node:path');

import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';

setFlagsFromString('--expose_gc');
const gc = runInNewContext('gc');

import { loadFile, CompileError } from '../index'

test('loadFile', (t) => {
    let demo = loadFile(path.join(__dirname, "resources/test.slint")) as any;
    let test = new demo.Test();
    t.is(test.check, "Test");

    let errorPath = path.join(__dirname, "resources/error.slint");

    const error = t.throws(() => {
        loadFile(errorPath)
    },
        { instanceOf: CompileError }
    );

    t.is(error?.message, "Could not compile " + errorPath);
    t.deepEqual(error?.diagnostics, [
        {
            columnNumber: 18,
            level: 0,
            lineNumber: 7,
            message: 'Missing type. The syntax to declare a property is `property <type> name;`. Only two way bindings can omit the type',
            fileName: errorPath
        },
        {
            columnNumber: 22,
            level: 0,
            lineNumber: 7,
            message: 'Syntax error: expected \';\'',
            fileName: errorPath
        },
        {
            columnNumber: 22,
            level: 0,
            lineNumber: 7,
            message: 'Parse error',
            fileName: errorPath
        },
    ]);
})

test('constructor parameters', (t) => {
    let demo = loadFile(path.join(__dirname, "resources/test-constructor.slint")) as any;
    let hello = "";
    let test = new demo.Test({ say_hello: function () { hello = "hello"; }, check: "test" });

    test.say_hello();

    t.is(test.check, "test");
    t.is(hello, "hello");
})


test('callback closure cyclic references do not prevent GC', async (t) => {

    // Setup:
    // A component instance with a callback installed from JS:
    // The callback captures the surrounding environment, which
    // includes an extra reference to the component instance itself
    // --> a cyclic reference
    //
    // Note: WeakRef's deref is used to observe the GC. This means that we must
    // separate the test into different jobs with await, to permit for collection.
    // (See https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref.prototype.deref)

    let demo_module = loadFile(path.join(__dirname, "resources/test-gc.slint")) as any;
    let demo = new demo_module.Test();
    t.is(demo.check, "initial value");
    t.true(Object.hasOwn(demo, "say_hello"));

    let demo_weak = new WeakRef(demo);

    function scope() {
        let copy = demo;
        copy.say_hello = () => {
            console.log(copy.check);
        };
    }
    scope();

    t.true(demo_weak.deref() !== undefined);

    // After the first GC, the instance should not have been collected because the
    // current environment's demo variable is a strong reference.
    await new Promise(resolve => setTimeout(resolve, 0));
    gc();

    t.true(demo_weak.deref() !== undefined);

    // Clear the strong reference here
    demo = null;

    // After the this GC call, the instance should have been collected. Strong references
    // in Rust should not keep it alive.
    await new Promise(resolve => setTimeout(resolve, 0));
    gc();

    t.is(demo_weak.deref(), undefined, "The demo instance should have been collected and the weak ref should deref to undefined");
})
