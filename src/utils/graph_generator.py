import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import re

class SQLGraphAgent:
    def __init__(self, sql_agent):
        self.sql_agent = sql_agent
        self.graph_keywords = ['plot', 'graph', 'chart', 'visualize', 'show chart', 'bar chart', 'line graph', 'histogram']
    
    def detect_graph_request(self, query):
        query_lower = query.lower()
        return any(keyword in query_lower for keyword in self.graph_keywords)
    
    def determine_chart_type(self, query, data):
        query_lower = query.lower()
        
        if 'bar' in query_lower or 'column' in query_lower:
            return 'bar'
        elif 'line' in query_lower or 'trend' in query_lower:
            return 'line'
        elif 'pie' in query_lower:
            return 'pie'
        elif 'scatter' in query_lower:
            return 'scatter'
        elif 'histogram' in query_lower or 'distribution' in query_lower:
            return 'histogram'
        else:
            # Auto-detect based on data
            if len(data.columns) == 2:
                if data.dtypes.iloc[1] in ['int64', 'float64']:
                    return 'bar'
            return 'bar'  # default
    
    def generate_graph(self, data, chart_type, query):
        """
        Generate a graph from the given data and return it as a base64-encoded PNG image.
        
        Args:
            data: Pandas DataFrame containing the data to plot
            chart_type: Type of chart to generate ('bar', 'line', 'pie', 'scatter', 'histogram')
            query: The original query that generated this graph (used for title)
            
        Returns:
            dict: Dictionary containing the base64-encoded image and metadata
        """
        print(f"[DEBUG] Generating {chart_type} graph with data shape: {data.shape}")
        print(f"[DEBUG] Data columns: {data.columns.tolist()}")
        print(f"[DEBUG] Data head:\n{data.head()}")
        
        try:
            import io
            import base64
            import matplotlib
            matplotlib.use('Agg')  # Use non-interactive backend
            import matplotlib.pyplot as plt
            
            # Ensure we have valid data
            if data is None or data.empty:
                raise ValueError("No data available to generate graph.")
                
            if len(data.columns) < 2:
                raise ValueError(f"Not enough columns for graph. Found {len(data.columns)} columns, need at least 2.")
            
            # Clean the data - convert non-numeric values to NaN and drop them
            numeric_cols = data.select_dtypes(include=['number']).columns
            if len(numeric_cols) == 0:
                raise ValueError("No numeric columns found for plotting.")
                
            # Use the first numeric column for y-axis if not enough numeric columns
            if len(numeric_cols) == 1:
                y_col = numeric_cols[0]
                x_col = data.columns[0] if data.columns[0] != y_col else data.columns[1]
            else:
                x_col, y_col = data.columns[0], data.columns[1]
            
            # Clean the data
            clean_data = data[[x_col, y_col]].dropna()
            
            if clean_data.empty:
                raise ValueError("No valid data points available after cleaning.")
            
            # Create the plot
            plt.figure(figsize=(10, 6))
            
            # Convert non-numeric x values to strings for categorical plotting
            if not pd.api.types.is_numeric_dtype(clean_data[x_col]):
                clean_data[x_col] = clean_data[x_col].astype(str)
            
            # Generate the appropriate plot based on chart type
            if chart_type == 'bar':
                plt.bar(clean_data[x_col], clean_data[y_col])
                plt.xticks(rotation=45, ha='right')
                plt.xlabel(x_col)
                plt.ylabel(y_col)
                
            elif chart_type == 'line':
                # Sort by x values for line plots
                sorted_data = clean_data.sort_values(by=x_col)
                plt.plot(sorted_data[x_col], sorted_data[y_col], marker='o')
                plt.xticks(rotation=45, ha='right')
                plt.xlabel(x_col)
                plt.ylabel(y_col)
                
            elif chart_type == 'pie':
                # For pie charts, use top 10 categories if there are many
                if len(clean_data) > 10:
                    top_data = clean_data.nlargest(10, y_col)
                    plt.pie(top_data[y_col], labels=top_data[x_col], autopct='%1.1f%%')
                    plt.title(f"Top 10 {y_col} by {x_col}")
                else:
                    plt.pie(clean_data[y_col], labels=clean_data[x_col], autopct='%1.1f%%')
                    
            elif chart_type == 'scatter':
                plt.scatter(clean_data[x_col], clean_data[y_col])
                plt.xlabel(x_col)
                plt.ylabel(y_col)
                
            elif chart_type == 'histogram':
                plt.hist(clean_data[y_col], bins=min(20, len(clean_data)))
                plt.xlabel(y_col)
                plt.ylabel('Frequency')
            
            # Set title and layout
            title = f"{query[:100]}"  # Limit title length
            plt.title(title)
            plt.tight_layout()
            
            # Save the plot to a bytes buffer as PNG
            buf = io.BytesIO()
            plt.savefig(
                buf, 
                format='png', 
                bbox_inches='tight',
                dpi=100,
                quality=95
            )
            plt.close()
            
            # Get the binary data and encode as base64
            buf.seek(0)
            img_data = buf.getvalue()
            buf.close()
            
            # Encode the image to base64
            img_str = base64.b64encode(img_data).decode('utf-8')
            
            print("[DEBUG] Graph generated and encoded successfully")
            # Return the base64 string directly as 'data' for the frontend
            return {
                'data': img_str,  # Just the base64 string, no 'data:' prefix
                'mime_type': 'image/png',
                'success': True
            }
            
        except Exception as e:
            error_msg = f"Could not generate graph: {str(e)}"
            print(f"[ERROR] {error_msg}")
            if hasattr(data, 'info'):
                print("[DEBUG] Data info:")
                print(data.info())
            else:
                print("[DEBUG] No data info available")
            return {
                'error': error_msg,
                'success': False
            }
    
    def process_query(self, query):
        # Get SQL results first
        sql_result = self.sql_agent.execute_query(query)
        
        response = {
            'response': str(sql_result),  # Default text response
            'graph': None,
            'success': True
        }
        
        # Check if graph is requested and we have data
        if self.detect_graph_request(query) and not sql_result.empty:
            try:
                chart_type = self.determine_chart_type(query, sql_result)
                print(f"[DEBUG] Generating {chart_type} chart for query: {query}")
                graph_data = self.generate_graph(sql_result, chart_type, query)
                
                if graph_data and 'data' in graph_data and graph_data['success']:
                    print("[DEBUG] Graph generated successfully")
                    response['graph'] = graph_data['data']
                    response['graph_data'] = graph_data
                else:
                    error_msg = graph_data.get('error', 'Unknown error generating graph')
                    print(f"[WARNING] Graph generation failed: {error_msg}")
                    response['response'] += f"\n\nNote: Could not generate graph: {error_msg}"
            except Exception as e:
                print(f"[ERROR] Error in graph generation: {str(e)}")
                response['response'] += f"\n\nError generating graph: {str(e)}"
        
        print(f"[DEBUG] Process query response: {response.keys()}")
        if 'graph' in response and response['graph']:
            print(f"[DEBUG] Graph data available, length: {len(response['graph'])}")
        return response