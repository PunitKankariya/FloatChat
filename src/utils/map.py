
import os
from fastapi import FastAPI
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits.sql.base import create_sql_agent, SQLDatabaseToolkit
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor


os.environ["GOOGLE_API_KEY"] = "AIzaSyDOm22gpP0mmHferjYrr3QF905r7Ogfl6s"


db = SQLDatabase.from_uri("sqlite:///tsunami_data.db")  


llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)


toolkit = SQLDatabaseToolkit(db=db, llm=llm)
agent = create_sql_agent(llm=llm, toolkit=toolkit, verbose=True)
agent_executor = AgentExecutor(agent=agent, tools=toolkit.get_tools(), verbose=True)

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "🌊 Tsunami Risk Agent is running successfully!"}

@app.get("/check_risk")
async def check_risk():
    query = "Find locations with highest tsunami risk"
    response = agent_executor.invoke({"input": query})
    return {"locations": response}
