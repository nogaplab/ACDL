# Minimal Test Results

Generated implementations using only the ACDL skill file patterns.

---

# Test M1: Quiz Tutor - RESULT

## Generated Implementation

```python
from dataclasses import dataclass
from typing import List, Optional

# Template constants
TUTOR_PERSONA = """..."""
DIFFICULTY_GUIDE = """..."""
HINT_FORMAT = """..."""

# Template functions
def TEACHING_STYLE(subject: str) -> str:
    return f"Teaching style for {subject}"

def QUESTION_FORMAT(difficulty: str) -> str:
    return f"Question at {difficulty} level:"


@dataclass
class TurnHistory:
    question: str
    student_answer: str
    was_correct: bool
    praise: Optional[str] = None
    hint: Optional[str] = None
    retry_answer: Optional[str] = None
    feedback: Optional[str] = None
    difficulty: str = "medium"


@dataclass
class AgentState:
    history: List[TurnHistory]
    subject: str


def build_messages(turn: int, state: AgentState, current_difficulty: str) -> List[dict]:
    messages = []

    # S: { TUTOR_PERSONA, TEACHING_STYLE(env.subject[@1]), DIFFICULTY_GUIDE }
    messages.append({
        "role": "system",
        "content": TUTOR_PERSONA + "\n\n" +
                   TEACHING_STYLE(state.subject) + "\n\n" +
                   DIFFICULTY_GUIDE
    })

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        turn_data = state.history[t-1]

        # A: { QUESTION_FORMAT(sys.difficulty[@t]), resp.question[@t] }
        messages.append({
            "role": "assistant",
            "content": QUESTION_FORMAT(turn_data.difficulty) + "\n" + turn_data.question
        })

        # U: env.student_answer[@t]
        messages.append({"role": "user", "content": turn_data.student_answer})

        # If sys.was_correct[@t]
        if turn_data.was_correct:
            # A: resp.praise[@t]
            messages.append({"role": "assistant", "content": turn_data.praise})
        else:
            # Else { A: { HINT_FORMAT, resp.hint[@t] } }
            messages.append({
                "role": "assistant",
                "content": HINT_FORMAT + "\n" + turn_data.hint
            })
            # U: env.retry_answer[@t]
            messages.append({"role": "user", "content": turn_data.retry_answer})
            # A: resp.feedback[@t]
            messages.append({"role": "assistant", "content": turn_data.feedback})

    # A: { QUESTION_FORMAT(sys.difficulty[@T]), resp.question[@T] }
    messages.append({
        "role": "assistant",
        "content": QUESTION_FORMAT(current_difficulty)
    })

    return messages


# Example usage
state = AgentState(
    history=[
        TurnHistory(
            question="What is 2+2?",
            student_answer="5",
            was_correct=False,
            hint="Try counting on your fingers",
            retry_answer="4",
            feedback="Correct! Well done.",
            difficulty="easy"
        )
    ],
    subject="math"
)
messages = build_messages(turn=2, state=state, current_difficulty="medium")
```

---

# Test M2: Meeting Scheduler - RESULT

## Generated Implementation

```python
from dataclasses import dataclass, field
from typing import List, Optional

# Template constants
SCHEDULER_INSTRUCTIONS = """..."""
TIMEZONE_RULES = """..."""
MEETING_REQUEST = """..."""

# Template functions
def ATTENDEE_INFO(name: str, email: str, timezone: str) -> str:
    return f"Attendee: {name} <{email}> (TZ: {timezone})"


@dataclass
class Attendee:
    name: str
    email: str
    timezone: str


@dataclass
class ToolCall:
    id: str
    invocation: str
    result: Optional[str] = None


@dataclass
class SubStep:
    reasoning: str
    tool_calls: List[ToolCall] = field(default_factory=list)


@dataclass
class TurnHistory:
    substeps: List[SubStep] = field(default_factory=list)
    proposal: Optional[str] = None
    needs_confirmation: bool = False
    user_response: Optional[str] = None


@dataclass
class AgentState:
    history: List[TurnHistory]
    meeting_details: str
    attendees: List[Attendee]


def build_messages(
    turn: int,
    substep: int,
    state: AgentState
) -> List[dict]:
    messages = []

    # S: { SCHEDULER_INSTRUCTIONS, TIMEZONE_RULES }
    messages.append({
        "role": "system",
        "content": SCHEDULER_INSTRUCTIONS + "\n\n" + TIMEZONE_RULES
    })

    # U: { MEETING_REQUEST, env.meeting_details[@1], ForEach(attendee: env.attendees[@1]) {...} }
    user_content = MEETING_REQUEST + "\n" + state.meeting_details + "\n"
    for attendee in state.attendees:
        user_content += ATTENDEE_INFO(attendee.name, attendee.email, attendee.timezone) + "\n"
    messages.append({"role": "user", "content": user_content})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        turn_data = state.history[t-1]

        # ForEach(@i: range(1, @t.substeps))
        for i in range(len(turn_data.substeps)):
            substep_data = turn_data.substeps[i]

            # A: { resp.reasoning[@t.@i], ForEach(tool: sys.tool_calls[@t.@i]) {...} }
            messages.append({
                "role": "assistant",
                "content": substep_data.reasoning,
                "tool_calls": [
                    {"id": tc.id, "function": {"name": "tool", "arguments": tc.invocation}}
                    for tc in substep_data.tool_calls
                ]
            })

            # ForEach(tool: sys.tool_calls[@t.@i]) { T: { tool.id, tool.result } }
            for tool in substep_data.tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.id,
                    "content": tool.result
                })

        # A: resp.proposal[@t]
        messages.append({"role": "assistant", "content": turn_data.proposal})

        # If sys.needs_confirmation[@t] { U: env.user_response[@t] }
        if turn_data.needs_confirmation:
            messages.append({"role": "user", "content": turn_data.user_response})

    # If @T.I > 0 - partial current turn
    if substep > 0:
        current_turn = state.history[turn-1]
        for i in range(substep):
            substep_data = current_turn.substeps[i]
            messages.append({
                "role": "assistant",
                "content": substep_data.reasoning,
                "tool_calls": [
                    {"id": tc.id, "function": {"name": "tool", "arguments": tc.invocation}}
                    for tc in substep_data.tool_calls
                ]
            })
            for tool in substep_data.tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.id,
                    "content": tool.result
                })

    return messages


# Example usage
state = AgentState(
    history=[],
    meeting_details="Project sync meeting, 30 minutes",
    attendees=[
        Attendee("Alice", "alice@example.com", "US/Pacific"),
        Attendee("Bob", "bob@example.com", "Europe/London")
    ]
)
messages = build_messages(turn=1, substep=0, state=state)
```

---

# Test M3: Legal Document Analyzer - RESULT

## Generated Implementation

```python
from dataclasses import dataclass, field
from typing import List, Optional

# Template constants
LEGAL_DISCLAIMER = """..."""
ANALYSIS_GUIDELINES = """..."""
CITATION_FORMAT = """..."""
DOCUMENT_HEADER = """..."""
SECTIONS_HEADER = """..."""
INITIAL_ANALYSIS_HEADER = """..."""
RISK_HEADER = """..."""
CITATION_HEADER = """..."""

# Template functions
def SECTION_BLOCK(number: str, title: str, content: str) -> str:
    return f"Section {number}: {title}\n{content}"

def RISK_ITEM(severity: str, description: str, clause_ref: str) -> str:
    return f"[{severity}] {description} (Ref: {clause_ref})"


@dataclass
class Section:
    number: str
    title: str
    content: str


@dataclass
class ParsedDocument:
    full_text: str
    sections: List[Section]


@dataclass
class Risk:
    severity: str
    description: str
    clause_ref: str


@dataclass
class Citation:
    reference: str


@dataclass
class TurnHistory:
    question: Optional[str] = None
    answer: Optional[str] = None
    has_citations: bool = False
    citations: List[Citation] = field(default_factory=list)


@dataclass
class AgentState:
    history: List[TurnHistory]
    summary: str
    identified_risks: List[Risk]


def parse_document(document: str) -> ParsedDocument:
    # TODO: Implement document parsing
    pass


def build_messages(
    turn: int,
    state: AgentState,
    document: str,
    current_question: str
) -> List[dict]:
    messages = []

    # S: { LEGAL_DISCLAIMER, ANALYSIS_GUIDELINES, CITATION_FORMAT }
    messages.append({
        "role": "system",
        "content": LEGAL_DISCLAIMER + "\n\n" + ANALYSIS_GUIDELINES + "\n\n" + CITATION_FORMAT
    })

    # Name doc := parse_document(env.document[@1])
    doc = parse_document(document)

    # U: { DOCUMENT_HEADER, $doc.full_text, SECTIONS_HEADER, ForEach(section: $doc.sections) {...} }
    user_content = DOCUMENT_HEADER + "\n" + doc.full_text + "\n\n" + SECTIONS_HEADER + "\n"
    for section in doc.sections:
        user_content += SECTION_BLOCK(section.number, section.title, section.content) + "\n\n"
    messages.append({"role": "user", "content": user_content})

    # A: { INITIAL_ANALYSIS_HEADER, resp.summary[@1], RISK_HEADER, ForEach(risk: resp.identified_risks[@1]) {...} }
    assistant_content = INITIAL_ANALYSIS_HEADER + "\n" + state.summary + "\n\n" + RISK_HEADER + "\n"
    for risk in state.identified_risks:
        assistant_content += RISK_ITEM(risk.severity, risk.description, risk.clause_ref) + "\n"
    messages.append({"role": "assistant", "content": assistant_content})

    # ForEach(@t: range(2, @T))
    for t in range(2, turn):
        turn_data = state.history[t-1]

        # U: env.question[@t]
        messages.append({"role": "user", "content": turn_data.question})

        # A: { resp.answer[@t], If sys.has_citations[@t] { CITATION_HEADER, ForEach(cite: sys.citations[@t]) {...} } }
        answer_content = turn_data.answer
        if turn_data.has_citations:
            answer_content += "\n\n" + CITATION_HEADER + "\n"
            for cite in turn_data.citations:
                answer_content += cite.reference + "\n"
        messages.append({"role": "assistant", "content": answer_content})

    # U: env.question[@T]
    messages.append({"role": "user", "content": current_question})

    return messages


# Example usage
state = AgentState(
    history=[],
    summary="This is a standard NDA with some unusual clauses...",
    identified_risks=[
        Risk("HIGH", "Non-compete extends 5 years", "Section 4.2"),
        Risk("MEDIUM", "Broad IP assignment clause", "Section 7.1")
    ]
)
messages = build_messages(
    turn=2,
    state=state,
    document="Full document text here...",
    current_question="What are the termination conditions?"
)
```

---

# Test M4: Data Pipeline Monitor - RESULT

## Generated Implementation

```python
from dataclasses import dataclass, field
from typing import List, Optional

# Template constants
MONITORING_ROLE = """..."""
ALERT_SEVERITY_GUIDE = """..."""
RESPONSE_PROTOCOL = """..."""
CONTEXT_SUMMARY_HEADER = """..."""
STATUS_REQUEST = """..."""
STATUS_HEADER = """..."""
ALERTS_HEADER = """..."""
FAILURE_ANALYSIS = """..."""
DEGRADATION_NOTICE = """..."""

# Template functions
def PIPELINE_STATUS(name: str, state: str, last_run: str) -> str:
    return f"Pipeline: {name}\nState: {state}\nLast Run: {last_run}"

def ALERT_ITEM(level: str, message: str, timestamp: str) -> str:
    return f"[{level}] {message} ({timestamp})"


@dataclass
class Alert:
    level: str
    message: str
    timestamp: str


@dataclass
class PipelineStatus:
    name: str
    state: str  # "running", "failed", "degraded", "healthy"
    last_run: str
    has_alerts: bool = False
    active_alerts: List[Alert] = field(default_factory=list)


@dataclass
class TurnHistory:
    query: str
    pipeline_id: str
    summary: Optional[str] = None
    failure_explanation: Optional[str] = None
    degradation_details: Optional[str] = None


@dataclass
class AgentState:
    history: List[TurnHistory]
    context_window: int = 1
    summarized_history: Optional[str] = None


def get_pipeline_status(pipeline_id: str) -> PipelineStatus:
    # TODO: Implement status retrieval
    pass


def build_messages(
    turn: int,
    state: AgentState,
    current_query: str,
    current_pipeline_id: str
) -> List[dict]:
    messages = []

    # S: { MONITORING_ROLE, ALERT_SEVERITY_GUIDE, RESPONSE_PROTOCOL }
    messages.append({
        "role": "system",
        "content": MONITORING_ROLE + "\n\n" + ALERT_SEVERITY_GUIDE + "\n\n" + RESPONSE_PROTOCOL
    })

    # Name W := sys.context_window[@T]
    W = state.context_window

    # If @$W > 1
    if W > 1:
        # A: CONTEXT_SUMMARY_HEADER
        messages.append({"role": "assistant", "content": CONTEXT_SUMMARY_HEADER})
        # A: sys.summarized_history[@$W]
        messages.append({"role": "assistant", "content": state.summarized_history})

    # ForEach(@t: range(@$W, @T))
    for t in range(W, turn):
        turn_data = state.history[t-1]

        # U: { STATUS_REQUEST, env.query[@t] }
        messages.append({
            "role": "user",
            "content": STATUS_REQUEST + "\n" + turn_data.query
        })

        # Name status := get_pipeline_status(env.pipeline_id[@t])
        status = get_pipeline_status(turn_data.pipeline_id)

        # Build assistant response
        assistant_content = STATUS_HEADER + "\n"
        assistant_content += PIPELINE_STATUS(status.name, status.state, status.last_run) + "\n"

        # If $status.has_alerts
        if status.has_alerts:
            assistant_content += "\n" + ALERTS_HEADER + "\n"
            for alert in status.active_alerts:
                assistant_content += ALERT_ITEM(alert.level, alert.message, alert.timestamp) + "\n"

        # Switch $status.state
        if status.state == "failed":
            assistant_content += "\n" + FAILURE_ANALYSIS + "\n"
            assistant_content += turn_data.failure_explanation
        elif status.state == "degraded":
            assistant_content += "\n" + DEGRADATION_NOTICE + "\n"
            assistant_content += turn_data.degradation_details
        else:
            assistant_content += "\n" + turn_data.summary

        messages.append({"role": "assistant", "content": assistant_content})

    # U: { STATUS_REQUEST, env.query[@T] }
    messages.append({
        "role": "user",
        "content": STATUS_REQUEST + "\n" + current_query
    })

    return messages


# Example usage
state = AgentState(
    history=[
        TurnHistory(
            query="Check ETL pipeline",
            pipeline_id="etl-001",
            summary="Pipeline running normally, last batch processed 10k records"
        )
    ],
    context_window=1
)
messages = build_messages(
    turn=2,
    state=state,
    current_query="Status of the analytics pipeline",
    current_pipeline_id="analytics-002"
)
```

---

# Test M5: Multi-Agent Debate - RESULT

## Generated Implementation

```python
from dataclasses import dataclass, field
from typing import List, Optional

# Template constants
MODERATOR_ROLE = """..."""
DEBATE_RULES = """..."""
ARGUMENT_STRUCTURE = """..."""
OPPONENT_SUMMARY = """..."""
CLOSING_INSTRUCTIONS = """..."""
SUMMARIZE_REQUEST = """..."""

# Template functions
def TOPIC_INTRO(topic: str) -> str:
    return f"Today's debate topic: {topic}"

def DEBATER_ROLE(side: str) -> str:
    return f"You are the {side} debater. Argue for the {side} position."

def SPECIALIST_ROLE(specialty: str) -> str:
    return f"You are a specialist in {specialty}."


@dataclass
class RoundHistory:
    round_intro: Optional[str] = None
    pro_argument: Optional[str] = None
    con_argument: Optional[str] = None


@dataclass
class DebaterState:
    arguments: List[str] = field(default_factory=list)


@dataclass
class DebateState:
    rounds: List[RoundHistory]
    topic: str
    pro_arguments: List[str] = field(default_factory=list)
    con_arguments: List[str] = field(default_factory=list)


def build_moderator_messages(round_num: int, state: DebateState) -> List[dict]:
    """Moderator[@round]"""
    messages = []

    # S: { MODERATOR_ROLE, DEBATE_RULES, TOPIC_INTRO(env.topic[@1]) }
    messages.append({
        "role": "system",
        "content": MODERATOR_ROLE + "\n\n" + DEBATE_RULES + "\n\n" + TOPIC_INTRO(state.topic)
    })

    # ForEach(@r: range(1, @round))
    for r in range(1, round_num):
        # A: resp.round_intro[@r]
        messages.append({"role": "assistant", "content": state.rounds[r-1].round_intro})

    # A: resp.round_intro[@round] - this is what we're generating
    # (For inference, this would be empty; for replay, append from history)

    return messages


def build_debater_messages(
    round_num: int,
    side: str,
    opponent_args: str,
    state: DebateState
) -> List[dict]:
    """Debater[@round](side, opponent_args)"""
    messages = []

    # S: { DEBATER_ROLE(side), ARGUMENT_STRUCTURE }
    messages.append({
        "role": "system",
        "content": DEBATER_ROLE(side) + "\n\n" + ARGUMENT_STRUCTURE
    })

    # If @round > 1 { U: { OPPONENT_SUMMARY, opponent_args } }
    if round_num > 1:
        messages.append({
            "role": "user",
            "content": OPPONENT_SUMMARY + "\n" + opponent_args
        })

    # ForEach(@r: range(1, @round))
    arguments = state.pro_arguments if side == "pro" else state.con_arguments
    for r in range(1, round_num):
        if r - 1 < len(arguments):
            # A: resp.argument[@r]
            messages.append({"role": "assistant", "content": arguments[r-1]})

    return messages


def build_debate_session_messages(turn: int, state: DebateState) -> List[dict]:
    """
    DebateSession[@T] - Full workflow combining all agents.

    This is a multi-agent composition. In practice, you would call each
    agent separately and combine their outputs. This function shows
    how the full conversation would look.
    """
    messages = []

    # Orchestrator[@1] - Moderator starts
    messages.extend(build_moderator_messages(1, state))

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        round_data = state.rounds[t-1]

        # Pro argues: Debater[@t]("pro", sys.con_arguments[@t])
        con_args_so_far = "\n".join(state.con_arguments[:t])
        pro_msgs = build_debater_messages(t, "pro", con_args_so_far, state)
        # Add pro argument
        if round_data.pro_argument:
            messages.append({"role": "assistant", "content": round_data.pro_argument})

        # Con responds: Debater[@t]("con", $pro_args)
        pro_args_so_far = "\n".join(state.pro_arguments[:t])
        con_msgs = build_debater_messages(t, "con", pro_args_so_far, state)
        # Add con argument
        if round_data.con_argument:
            messages.append({"role": "assistant", "content": round_data.con_argument})

        # Moderator transitions
        if round_data.round_intro:
            messages.append({"role": "assistant", "content": round_data.round_intro})

    # Final round - Debater[@T]("pro"...) and Debater[@T]("con"...)
    # (Would generate new arguments at turn T)

    # Closing
    # S: CLOSING_INSTRUCTIONS
    messages.append({"role": "system", "content": CLOSING_INSTRUCTIONS})
    # U: SUMMARIZE_REQUEST
    messages.append({"role": "user", "content": SUMMARIZE_REQUEST})

    return messages


# Example usage
state = DebateState(
    rounds=[
        RoundHistory(
            round_intro="Welcome to round 1. Pro, please begin.",
            pro_argument="AI will create more jobs than it destroys...",
            con_argument="History shows automation leads to displacement..."
        )
    ],
    topic="AI will benefit humanity",
    pro_arguments=["AI will create more jobs than it destroys..."],
    con_arguments=["History shows automation leads to displacement..."]
)
messages = build_debate_session_messages(turn=2, state=state)
```

---

# Summary

| Test | Complexity | Key Challenges | Status |
|------|------------|----------------|--------|
| M1: Quiz Tutor | Medium | If/Else branches, conditional messages | ✓ |
| M2: Meeting Scheduler | Hard | Substeps, tool calls, partial turns | ✓ |
| M3: Legal Analyzer | Medium-Hard | Named vars, nested loops, multiple templates | ✓ |
| M4: Pipeline Monitor | Hard | Compaction (@$W), Switch/Case, retrieval | ✓ |
| M5: Multi-Agent Debate | Expert | Agent composition, parameterized agents | ✓ |

## Observations

1. **Test M1** - The If/Else pattern with multiple assistant messages in the else branch requires careful message sequencing.

2. **Test M2** - Classic tool-use pattern with substeps. The `@T.I` handling follows the skill file's Pattern 2 closely.

3. **Test M3** - The `range(2, @T)` starting from 2 (not 1) is unusual and tests whether the agent notices non-standard loop bounds.

4. **Test M4** - Combines compaction (`@$W`) with Switch/Case. The retrieval happening mid-loop (for each history turn) is tricky.

5. **Test M5** - Multi-agent composition is the hardest. Requires understanding that separate `Agent` definitions become separate functions, and that composition means sequencing their outputs.
