port module MyPortModule exposing (..)

import Html exposing (..)
import Html.Events exposing (..)

port portttojs : String -> Cmd msg

{- type alias JsCmd =
    {
         cmd : String,
         payload : String
    }-}

port portfromjs : (String -> msg) -> Sub msg

-- MODEL


type alias Model =
    String


init : ( Model, Cmd Msg )
init =
    ( "Hello", Cmd.none )



-- MESSAGES


type Msg
    = ToJs
    | FromJs String



-- VIEW


view : Model -> Html Msg
view model =
    div []
        [ text model
        , button [onClick ToJs] [text "ToJs!"] ]



-- UPDATE


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ToJs ->
            ( model, Cmd.batch [portttojs model] )
        FromJs jsCmd ->
            ("Got cmd from js!", Cmd.none)



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    portfromjs FromJs



-- MAIN


main : Program (Maybe String) Model Msg
main =
    Html.programWithFlags
        { init = \f -> init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }
