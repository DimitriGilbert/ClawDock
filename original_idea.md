playing with https://docs.openclaw.ai/ i came up with an ide...
this project is cool but it seems bloated from the start and full of constraint !
what i had in mind was :
A self evolving Agentic system based on docker compose named ClawDock
the goal would be to have a self contained base stack build around the current monorepo
For inference, we would use a containerized version of [opencode](https://opencode.ai/docs)  to run as a server (https://opencode.ai/docs/server/) but we should leave the door open to support other harnesses in the future
Like some Humans are building homes with container, the Agent will build itself a castle using containerized apps
the Agent will have aset of https://agents.md files that control its behavior following best prctice from agents-md skill (those file would still be given at each turn)
* AGENTS.md the normal orperatin agents.md
* SOUL.md describing the agent in general, its name, feel, ethics, ...
* GOALS.md describing the long term goals of the Agent (may be split)
* REFLECTION.md by the Agent to reflect upon itself and pass along personality between turn, freely updatable by the Agent (may be split)
we would rely heavily on https://agentskills.io/home to guide the Agent in each of its tasks using https://skills.sh/docs for example (there is a skill to find skills ! https://skills.sh/vercel-labs/skills/find-skills)

The goal would be to rely as litle as possible on cloud solution if local containerized can do.
Missing apps would become projects to realise to help toward the goal
they would be build by the Agent using execution loops resembling what i did with https://github.com/DimitriGilbert/task-o-matic (unfortunately, not applicable with this tool, but heavy inspiration for the workflow can be taken)
apps could also be forks of existing projects modified to suite the Agents need if it requires less works
apps would run in container so that if one crash it would not impact the castle in a domino effect !
apps should be hosted and have OSS licences and bootstrapped using better-t-stack as much as possible

Agents would commuicate with the external world through Bays (see the methaphore ;) ) and the most basic bay we must have is

each Agent will have its own directory in ./data with a docker-compose, its config, agents files, a workspce/ with its apps code, its actual data (kind of its home)

the central app should be named Gateway and be able to control the compose stack, add/modify/remove services start/stop them, 
maybe be some kind of proxy for the services from the outside, in order to not hug too many ports
we might want a convex backend for the most reactive part for realtime update in the gateway UI, 
for the AI chat as well (no need for anything fancy) you can use AI-SDK and AI-Elements from Vercel
the API and chat would be the default Bay, but I want emails and rss to be supported out of the box too
we might need a heartbeat mechanism to check bays input, programatically, without AI call at first (to stay efficient) and only trigger on certain configurable conditions

as you can see, this is a massive endavor that will require you to split the planification phase among many subagents (one per part !) in order to succeed
each subagent will be responsible for the creation of the PRD for it's part, maybe they will have questions
and if so they should create a separate question file so that we can work without bloating your context from the start ! you will be a subagent orchestrator on this one (that will interface betweeen me and many of them)

you will build a plan for the planification phase so that we can agree on the work split and agent type/skills every subagent should have
do you have any questions to refine this original idea before you start planning ?
