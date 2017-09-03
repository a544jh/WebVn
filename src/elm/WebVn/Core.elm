module WebVn.Core exposing (..)


type alias Player =
    { story : List Prompt
    , promptIndex : Int
    , state : State
    }

initialPlayer : Player
initialPlayer = {
    story = [AnimatablePrompt
    { preCmds = []
    , text = Just
        { style = Adv
        , textCmds = [AppendText {text = "HelloWorld!", color = "#000000", typeSpeed = 20}]
        , nameTag = Just {text = "Asd", color = "#000000", typeSpeed = 0}
        }
    , stop = True
    , label = Nothing
    }]
    , promptIndex = 0
    , state = initialState
    }

type Prompt
    = AnimatablePrompt PromptParams
    | ControlStructure -- TODO Descision


type alias PromptParams =
    { preCmds : List Command
    , text : Maybe TextPrompt
    , stop : Bool
    , label : Maybe String
    }


type ControlStructure
    = CondintionalJump ToLabel Bool
    | End


type alias ToLabel =
    String


type Command
    = SpriteCmd
    | BgCmd


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


type TextPromptStyle
    = Adv
    | Nvl
    | Note
    | Freeform


type alias TextBoxState =
    { style : Maybe TextPromptStyle
    , transitionFrom : Maybe TextPromptStyle
    , nameTag : NameTag
    , commands : List TextCommand
    }

initialTextBoxState : TextBoxState
initialTextBoxState =
    { style = Nothing
    , transitionFrom = Nothing
    , nameTag = Nothing
    , commands = []
    }

type alias State =
    { music : ()
    , --TODO
      background : ()
    , --TODO
      sprites : List ()
    , --TODO
      preCommands : List Command
    , textBox : TextBoxState
    , sceneName : String
    }

initialState : State
initialState =
    { music = ()
    , background = ()
    , sprites = []
    , preCommands = []
    , textBox = initialTextBoxState
    , sceneName = ""
    }

advance : Player -> Player
advance player =
    let
        nextIndex =
            player.promptIndex + 1

        nextPrompt =
            List.drop nextIndex player.story |> List.head
    in
        case nextPrompt of
            Just prompt ->
                case prompt of
                    AnimatablePrompt params ->
                        { player
                            | state = applyAnimatablePrompt params player.state
                            , promptIndex = nextIndex
                        }
                    --TODO
                    ControlStructure ->
                        player

            Nothing ->
                player


applyAnimatablePrompt : PromptParams -> State -> State
applyAnimatablePrompt prompt state =
    { state
        | textBox = updateTextBox prompt.text state.textBox
    }


updateTextBox : Maybe TextPrompt -> TextBoxState -> TextBoxState
updateTextBox textPrompt textBoxState =
    case textPrompt of
        Just textPrompt ->
            { textBoxState
                | style = Just textPrompt.style
                , transitionFrom = textBoxState.style
                , nameTag = textPrompt.nameTag
                , commands = textPrompt.textCmds
            }

        Nothing ->
            { textBoxState
                | style = Nothing
                , transitionFrom = textBoxState.style

                --, nameTag = TODO EMPTY
                , commands = []
            }
