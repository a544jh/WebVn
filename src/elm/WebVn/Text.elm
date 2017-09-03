module WebVn.Text exposing (..)

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


type alias TextBoxState =
    { style : Maybe TextPromptStyle
    , transitionFrom : Maybe TextPromptStyle
    , nameTag : NameTag
    , prevNameTag : NameTag
    , commands : List TextCommand
    }

initialTextBoxState : TextBoxState
initialTextBoxState =
    { style = Nothing
    , transitionFrom = Nothing
    , nameTag = Nothing
    , prevNameTag = Nothing
    , commands = []
    }