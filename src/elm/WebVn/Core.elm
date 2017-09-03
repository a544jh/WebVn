module Main exposing (..)


type alias Player =
    { story : List Prompt
    , promptIndex : Int
    , state : State
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
    { style : TextPromptStyle
    , transitionFrom : Maybe TextPromptStyle
    , nameTag : NameTag
    , commands : List TextCommand
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


advance : Player -> Player
advance player =
    let
        nextIndex =
            player.promptIndex + 1

        nextPrompt =
            List.take nextIndex player.story |> List.head
    in
        case nextPrompt of
            Just prompt ->
                case prompt of
                    AnimatablePrompt params ->
                        { player
                            | state = applyAnimatablePrompt params player.state
                            , promptIndex = nextIndex
                        }

                    ControlStructure ->
                        player

            --TODO
            Nothing ->
                player


applyAnimatablePrompt : PromptParams -> State -> State
applyAnimatablePrompt prompt state =
    state
