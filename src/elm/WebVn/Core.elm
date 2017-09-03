module WebVn.Core exposing (..)

import WebVn.Text exposing (..)

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
    }, basicAdvPrompt "Prompt 1!", basicAdvPrompt "Prompt 2!"]
    , promptIndex = -1
    , state = initialState
    }

type Prompt
    = AnimatablePrompt PromptParams
    | ControlStructure -- TODO Descision

basicAdvPrompt : String -> Prompt
basicAdvPrompt string =
    case initialPrompt of
        AnimatablePrompt params ->
            AnimatablePrompt {params | text = Just <| WebVn.Text.basicAdvPrompt string}
        _ -> initialPrompt

type alias PromptParams =
    { preCmds : List Command
    , text : Maybe TextPrompt
    , stop : Bool
    , label : Maybe String
    }

initialPrompt : Prompt
initialPrompt =
    AnimatablePrompt
    { preCmds = []
    , text = Nothing
    , stop = True
    , label = Nothing
    }

type ControlStructure
    = CondintionalJump ToLabel Bool
    | End


type alias ToLabel =
    String


type Command
    = SpriteCmd
    | BgCmd


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



