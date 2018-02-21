module WebVn.Text exposing (..)

import Json.Encode as JE

updateTextBox : Maybe TextPrompt -> TextBoxState -> TextBoxState
updateTextBox textPrompt oldState =
    case textPrompt of
        Just textPrompt ->
            { style = Just textPrompt.style
            , transitionFrom = oldState.style
            , nameTag = textPrompt.nameTag
            , prevNameTag = oldState.nameTag
            , commands = textPrompt.textCmds
            }

        Nothing ->
            { oldState
                | style = Nothing
                , transitionFrom = oldState.style

                --, nameTag = TODO EMPTY
                , commands = []
            }

type TextCommand
    = Command
    | AppendText TextNode


type alias TextNode =
    { text : String
    , color : String
    , typeSpeed : Int
    }

emptyTextNode : TextNode
emptyTextNode = 
    { text = ""
    , color = "#000000"
    , typeSpeed = 0
    }

type alias NameTag =
    Maybe TextNode


type alias TextPrompt =
    { style : TextPromptStyle
    , textCmds : List TextCommand
    , nameTag : NameTag
    }

basicAdvPrompt : String -> TextPrompt
basicAdvPrompt string =
    { style = Adv
    , textCmds = [AppendText {text = string, color = "#000000", typeSpeed = 20}]
    , nameTag = Nothing
    }

type TextPromptStyle
    = Adv
    | Nvl
    | Note
    | Freeform

textPromptStyleToJson : Maybe TextPromptStyle -> JE.Value
textPromptStyleToJson style =
    case style of
        Just style ->
            case style of
                Adv -> JE.string "adv"
                Nvl -> JE.string "nvl"
                Note -> JE.string "note"
                Freeform -> JE.string "freeform"
        Nothing -> JE.null

type alias TextBoxState =
    { style : Maybe TextPromptStyle
    , transitionFrom : Maybe TextPromptStyle
    , nameTag : NameTag
    , prevNameTag : NameTag
    , commands : List TextCommand
    }

textBoxStateToJson : TextBoxState -> JE.Value
textBoxStateToJson state =
    JE.object
        [ ("style", textPromptStyleToJson state.style)
        , ("transitionFrom", JE.string "TODO")
        , ("nameTag", JE.string "TODO")
        , ("commands", JE.string "TODO")
        ]

initialTextBoxState : TextBoxState
initialTextBoxState =
    { style = Nothing
    , transitionFrom = Nothing
    , nameTag = Nothing
    , prevNameTag = Nothing
    , commands = []
    }