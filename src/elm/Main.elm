port module Main exposing (..)

import Html exposing (..)
import Html.Events exposing (..)
import WebVn.Core

port jsUpdate : String -> Cmd msg

type alias JsCmd =
    {
         cmd : String,
         payload : String
    }

port jsCmd : (JsCmd -> msg) -> Sub msg

-- MODEL


type alias Model =
    WebVn.Core.Player


init : ( Model, Cmd Msg )
init = (WebVn.Core.initialPlayer, Cmd.none)


-- MESSAGES


type Msg
    = ToJs
    | FromJs JsCmd



-- VIEW


view : Model -> Html Msg
view model =
    div []
        [ text <| toString model
        , button [onClick ToJs] [text "ToJs!"] ]



-- UPDATE


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ToJs ->
            ( model, Cmd.batch [jsUpdate <| toString model] )
        FromJs jsCmd ->
            ( WebVn.Core.advance model, Cmd.batch [jsUpdate <| toString model])



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    jsCmd FromJs



-- MAIN


main : Program (Maybe String) Model Msg
main =
    Html.programWithFlags
        { init = \f -> init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }

add : number -> number -> number
add a b =
    a + b