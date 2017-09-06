module Renderer exposing (Model, Msg, update, view, subscriptions, init)


import Html exposing (..)
import Html.Attributes
import Html.Events
import Animation
import Time


main : Program Never Model Msg
main =
    Html.program
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
    }


type alias Model =
    { nameTag : NameTag
    }

type alias NameTag =
    { text : String
    , style : Animation.State
    }


type Msg
    = Animate Animation.Msg
    | ShowNameTag


linear2s : Animation.Interpolation
linear2s = 
    Animation.easing {duration = 1 * Time.second, ease = identity}

update : Msg -> Model -> (Model, Cmd Msg)
update msg model =
    case msg of
        Animate animMsg ->
            let
                newStyle = Animation.update animMsg model.nameTag.style
                mnt = model.nameTag
                newNameTag = {mnt | style = newStyle}
            in
                ({model | nameTag = newNameTag}, Cmd.none)
        ShowNameTag ->
            let
                mnt = model.nameTag
                newStyle = Animation.interrupt
                    [Animation.loop
                        [ Animation.toWith linear2s [ Animation.scale3d 1 1 1 ]
                        , Animation.toWith linear2s [Animation.scale3d 1 0 1]]
                    ]
                    mnt.style
                nnt = {mnt | style = newStyle}
            in ({model | nameTag = nnt}, Cmd.none)

nameTagToHtml : NameTag -> Html msg
nameTagToHtml nameTag =
    div (List.concat
            [Animation.render nameTag.style
            , [Html.Attributes.style [("background", "grey")]]
            ]) [text nameTag.text]

view : Model -> Html Msg
view model =
    div [][nameTagToHtml model.nameTag, button [Html.Events.onClick ShowNameTag][text "ShowNameTag"] ]


subscriptions : Model -> Sub Msg
subscriptions model =
    Animation.subscription Animate [model.nameTag.style]


init : (Model, Cmd Msg)
init = 
    (modelInitialValue, Cmd.none)

modelInitialValue : Model
modelInitialValue =
    {nameTag =
        { text = "Asd"
        , style = Animation.style [Animation.scale3d 1 0 1]
        }
    }
