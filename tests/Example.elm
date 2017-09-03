module Example exposing (..)

import Expect exposing (Expectation)
import Fuzz exposing (Fuzzer, int, list, string)
import Test exposing (..)
import MyPortModule

suite : Test
suite =
    concat [
    test "always true" (\_ -> Expect.pass)
    ,test "add should add two numbers" (\_ -> Expect.equal (MyPortModule.add 2 3) 5)
    ,test "let's fail" (\_ -> Expect.fail "lol")
    ]
