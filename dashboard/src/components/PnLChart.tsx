import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
} from 'recharts';
import { 
  Box, 
  Text, 
  Icon, 
  Flex, 
  ButtonGroup, 
  Button, 
  HStack, 
  Stat, 
  StatLabel, 
  StatNumber, 
  StatArrow, 
  StatHelpText,
  Select,
  Divider,
  Tooltip as ChakraTooltip,
  Card,
  CardBody,
} from '@chakra-ui/react';
import { 
  BarChart2Icon, 
  TrendingUpIcon, 
  TrendingDownIcon, 
  CalendarIcon,
  DollarSignIcon,
  PercentIcon,
  InfoIcon,
  DownloadIcon,
} from 'lucide-react';

interface PnLDataPoint {
  date: string;
  value: number;
  actualValue?: number; // Actual portfolio value for tooltip display
}

interface PnLChartProps {
  data: PnLDataPoint[];
  title?: string;
  height?: number | string;
}

const PnLChart: React.FC<PnLChartProps> = ({ 
  data, 
  title = "Performance History",
  height = "400px" 
}) => {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('area');
  const [timeframe, setTimeframe] = useState<'all' | '30d' | '7d' | '1d'>('all');
  
  // Format values for display
  const formatValue = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;
  
  // Process and sort data by date
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Clone and sort data
    const sorted = [...data].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
    
    // Apply timeframe filter
    if (timeframe !== 'all') {
      const now = new Date();
      let cutoffDate: Date;
      
      if (timeframe === '1d') {
        cutoffDate = new Date(now.setDate(now.getDate() - 1));
      } else if (timeframe === '7d') {
        cutoffDate = new Date(now.setDate(now.getDate() - 7));
      } else if (timeframe === '30d') {
        cutoffDate = new Date(now.setDate(now.getDate() - 30));
      }
      
      return sorted.filter(item => new Date(item.date) >= cutoffDate!);
    }
    
    return sorted;
  }, [data, timeframe]);

  // Calculate performance metrics
  const metrics = useMemo(() => {
    if (sortedData.length === 0) return null;
    
    // Validate data to ensure all values are valid numbers
    const validData = sortedData.filter(d => 
      typeof d.value === 'number' && !isNaN(d.value) && isFinite(d.value)
    );
    
    if (validData.length === 0) return null;
    
    // For PnL chart, the data is already relative to starting point (0)
    // But we need to calculate percentage based on the actual portfolio value
    const startActualValue = validData[0].actualValue !== undefined 
      ? validData[0].actualValue 
      : validData[0].value;
      
    const endValue = validData[validData.length - 1].value;
    const endActualValue = validData[validData.length - 1].actualValue !== undefined 
      ? validData[validData.length - 1].actualValue 
      : validData[validData.length - 1].value;
    
    // Guard against zero or negative start values
    if (startActualValue <= 0) return null;
    
    const absoluteChange = endValue; // Already relative to 0
    const percentChange = (absoluteChange / startActualValue) * 100;
    
    // Calculate daily return
    let dailyReturns: number[] = [];
    for (let i = 1; i < validData.length; i++) {
      // For calculating returns, we need to use actual portfolio values if available
      const prevActualValue = validData[i-1].actualValue !== undefined 
        ? validData[i-1].actualValue 
        : validData[i-1].value;
        
      const currActualValue = validData[i].actualValue !== undefined 
        ? validData[i].actualValue 
        : validData[i].value;
      
      // Skip invalid calculations (division by zero or very small numbers)
      if (!prevActualValue || prevActualValue <= 0 || !isFinite(prevActualValue)) continue;
      if (!currActualValue || !isFinite(currActualValue)) continue;
      
      const dailyReturn = ((currActualValue - prevActualValue) / prevActualValue) * 100;
      if (!isNaN(dailyReturn) && isFinite(dailyReturn)) {
        dailyReturns.push(dailyReturn);
      }
    }
    
    // If we don't have enough data points for returns, return basic metrics only
    if (dailyReturns.length < 2) {
      return {
        startValue: startActualValue,
        endValue: endActualValue,
        absoluteChange,
        percentChange,
        avgDailyReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0
      };
    }
    
    // Clean and cap extreme values in daily returns
    const cleanedDailyReturns = dailyReturns.filter(val => 
      !isNaN(val) && isFinite(val) && Math.abs(val) < 50 // Cap at 50% daily change to avoid outliers
    );
    
    // Calculate volatility (standard deviation of daily returns)
    const avgReturn = cleanedDailyReturns.length > 0 ? 
      cleanedDailyReturns.reduce((sum, val) => sum + val, 0) / cleanedDailyReturns.length : 0;
      
    const squaredDiffs = cleanedDailyReturns.map(val => Math.pow(val - avgReturn, 2));
    const avgSquaredDiff = squaredDiffs.length > 0 ?
      squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length : 0;
    const volatility = Math.sqrt(avgSquaredDiff);
    
    // Calculate Sharpe ratio (assuming risk-free rate of 0 for simplicity)
    // Use more conservative annualization factors for trading days
    const annualizedReturn = avgReturn * 252; // Assuming 252 trading days per year
    const annualizedVolatility = volatility * Math.sqrt(252);
    const sharpeRatio = annualizedVolatility !== 0 && isFinite(annualizedVolatility) ? 
      annualizedReturn / annualizedVolatility : 0;
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    // For drawdown calculation we need to use actual values when available
    let peakValue = validData[0].actualValue !== undefined ? validData[0].actualValue : validData[0].value;
    
    for (const point of validData) {
      const pointValue = point.actualValue !== undefined ? point.actualValue : point.value;
      
      if (pointValue > peakValue) {
        peakValue = pointValue;
      } else if (peakValue > 0) { // Guard against division by zero
        const drawdown = (peakValue - pointValue) / peakValue;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }
    
    return {
      startValue: startActualValue,
      endValue: endActualValue,
      absoluteChange,
      percentChange,
      avgDailyReturn: avgReturn,
      volatility,
      sharpeRatio,
      maxDrawdown: maxDrawdown * 100
    };
  }, [sortedData]);

  // Calculate data for derivative metrics
  const extendedData = useMemo(() => {
    if (sortedData.length <= 1) return sortedData;
    
    return sortedData.map((point, index) => {
      if (index === 0) {
        return {
          ...point,
          dailyChange: 0,
          percentChange: 0,
        };
      }
      
      const prevValue = sortedData[index - 1].value;
      const dailyChange = point.value - prevValue;
      const percentChange = (dailyChange / prevValue) * 100;
      
      return {
        ...point,
        dailyChange,
        percentChange,
      };
    });
  }, [sortedData]);

  // Determine chart color based on performance
  const chartColor = useMemo(() => {
    if (!metrics) return "#0072B5"; // Default blue
    return metrics.percentChange >= 0 ? "#38A169" : "#E53E3E"; // Green for positive, red for negative
  }, [metrics]);

  // Handle exporting chart data
  const exportData = () => {
    if (!sortedData.length) return;
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Value\n" 
      + sortedData.map(row => `${row.date},${row.value}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `performance_data_${timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!data || data.length === 0) {
    return (
      <Flex direction="column" align="center" justify="center" height={height}>
        <Icon as={BarChart2Icon} boxSize={6} color="gray.400" mb={2} />
        <Text color="gray.500" fontSize="sm">No performance data available</Text>
      </Flex>
    );
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <HStack>
          <Text 
            fontSize="md" 
            fontWeight="medium" 
            fontFamily="heading" 
            color="brand.navy"
            letterSpacing="0.5px"
          >
            {title}
          </Text>
          {metrics && (
            <ChakraTooltip 
              label="Performance metrics based on trading history" 
              placement="top"
              bg="brand.navy"
              color="brand.gold"
            >
              <Icon as={InfoIcon} color="brand.copper" boxSize={4} />
            </ChakraTooltip>
          )}
        </HStack>
        <HStack spacing={4}>
          <ButtonGroup size="xs" isAttached variant="outline">
            <Button
              onClick={() => setChartType('line')}
              bg={chartType === 'line' ? 'brand.navy' : 'transparent'}
              color={chartType === 'line' ? 'brand.gold' : 'brand.navy'}
              borderColor="brand.copper"
              _hover={{
                bg: chartType === 'line' ? 'brand.mahogany' : 'rgba(212, 175, 55, 0.1)'
              }}
              leftIcon={<TrendingUpIcon size={14} />}
              fontFamily="heading"
            >
              Line
            </Button>
            <Button
              onClick={() => setChartType('area')}
              bg={chartType === 'area' ? 'brand.navy' : 'transparent'}
              color={chartType === 'area' ? 'brand.gold' : 'brand.navy'}
              borderColor="brand.copper"
              _hover={{
                bg: chartType === 'area' ? 'brand.mahogany' : 'rgba(212, 175, 55, 0.1)'
              }}
              leftIcon={<BarChart2Icon size={14} />}
              fontFamily="heading"
            >
              Area
            </Button>
            <Button
              onClick={() => setChartType('bar')}
              bg={chartType === 'bar' ? 'brand.navy' : 'transparent'}
              color={chartType === 'bar' ? 'brand.gold' : 'brand.navy'}
              borderColor="brand.copper"
              _hover={{
                bg: chartType === 'bar' ? 'brand.mahogany' : 'rgba(212, 175, 55, 0.1)'
              }}
              leftIcon={<BarChart2Icon size={14} />}
              fontFamily="heading"
            >
              Bar
            </Button>
          </ButtonGroup>
          
          <Box 
            borderRadius="md" 
            border="1px solid" 
            borderColor="brand.copper" 
            bg="brand.parchment"
          >
            <Select 
              size="xs" 
              width="110px" 
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              bg="transparent"
              borderColor="transparent"
              color="brand.navy"
              fontFamily="heading"
              icon={<Icon as={CalendarIcon} color="brand.copper" />}
            >
              <option value="all">All Time</option>
              <option value="30d">Last Month</option>
              <option value="7d">Last Week</option>
              <option value="1d">Last Day</option>
            </Select>
          </Box>
          
          <Button 
            size="xs" 
            leftIcon={<DownloadIcon size={14} />} 
            onClick={exportData}
            variant="outline"
            borderColor="brand.copper"
            color="brand.navy"
            _hover={{
              bg: "rgba(212, 175, 55, 0.1)"
            }}
            fontFamily="heading"
          >
            Export Data
          </Button>
        </HStack>
      </Flex>
      
      {/* Performance Metrics */}
      {metrics && (
        <SimpleMetricsCard metrics={metrics} />
      )}
      
      {/* Chart Container */}
      <Box h={height} w="100%" mt={4}>
        <ResponsiveContainer width="100%" height="100%">
          {(() => {
            // We're using an IIFE to ensure a single React element is returned
            if (chartType === 'line') {
              return (
            <LineChart
              data={sortedData}
              margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
                angle={-45}
                textAnchor="end"
                height={50}
                tickFormatter={(timestamp) => {
                  return new Date(timestamp).toLocaleDateString();
                }}
              />
              <YAxis
                tickFormatter={formatValue}
                domain={['auto', 'auto']}
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  // For the PnL value (relative to starting point)
                  const formattedValue = `$${value.toFixed(2)}`;
                  
                  // Display both PnL and actual value if available
                  if (props.payload && props.payload[0]?.payload?.actualValue !== undefined) {
                    return [
                      <>
                        <div><strong>PnL:</strong> {formattedValue}</div>
                        <div><strong>Value:</strong> ${props.payload[0].payload.actualValue.toFixed(2)}</div>
                      </>, 
                      'Portfolio'
                    ];
                  }
                  
                  return [formattedValue, 'PnL'];
                }}
                labelFormatter={(label) => `Date: ${new Date(label).toLocaleDateString()}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  borderColor: '#CBD5E0',
                  borderRadius: '4px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  fontSize: '12px'
                }}
              />
              <Legend 
                wrapperStyle={{ 
                  paddingTop: '10px',
                  fontSize: '12px'
                }}
              />
              <ReferenceLine 
                y={0} 
                stroke="#718096" 
                strokeDasharray="3 3" 
                label={{ 
                  value: 'Break-even', 
                  position: 'insideBottomRight',
                  fill: '#718096',
                  fontSize: 10
                }} 
              />
              <Line
                type="monotone"
                dataKey="value"
                name="P&L"
                stroke={chartColor}
                strokeWidth={2}
                dot={{ fill: chartColor, r: 3 }}
                activeDot={{ fill: chartColor, r: 5, stroke: 'white', strokeWidth: 2 }}
              />
            </LineChart>
              );
            }
            
            if (chartType === 'area') {
              return (
            <AreaChart
              data={sortedData}
              margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
                angle={-45}
                textAnchor="end"
                height={50}
                tickFormatter={(timestamp) => {
                  return new Date(timestamp).toLocaleDateString();
                }}
              />
              <YAxis
                tickFormatter={formatValue}
                domain={['auto', 'auto']}
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  // For the PnL value (relative to starting point)
                  const formattedValue = `$${value.toFixed(2)}`;
                  
                  // Display both PnL and actual value if available
                  if (props.payload && props.payload[0]?.payload?.actualValue !== undefined) {
                    return [
                      <>
                        <div><strong>PnL:</strong> {formattedValue}</div>
                        <div><strong>Value:</strong> ${props.payload[0].payload.actualValue.toFixed(2)}</div>
                      </>, 
                      'Portfolio'
                    ];
                  }
                  
                  return [formattedValue, 'PnL'];
                }}
                labelFormatter={(label) => `Date: ${new Date(label).toLocaleDateString()}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  borderColor: '#CBD5E0',
                  borderRadius: '4px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine 
                y={0} 
                stroke="#718096" 
                strokeDasharray="3 3" 
                label={{ 
                  value: 'Break-even', 
                  position: 'insideBottomRight',
                  fill: '#718096',
                  fontSize: 10
                }} 
              />
              <Area
                type="monotone"
                dataKey="value"
                name="P&L"
                stroke={chartColor}
                fill={chartColor}
                fillOpacity={0.2}
                strokeWidth={2}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </AreaChart>
              );
            }
            
            if (chartType === 'bar') {
              return (
            <ComposedChart
              data={extendedData}
              margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
                angle={-45}
                textAnchor="end"
                height={50}
                tickFormatter={(timestamp) => {
                  return new Date(timestamp).toLocaleDateString();
                }}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={formatValue}
                orientation="left"
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
              />
              <YAxis
                yAxisId="right"
                tickFormatter={formatPercent}
                orientation="right"
                tick={{ fill: '#27272A', fontSize: 11 }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={{ stroke: '#27272A' }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  if (name === 'Daily Change %') return [`${value.toFixed(2)}%`, name];
                  
                  // For the PnL value (relative to starting point)
                  if (name === 'P&L') {
                    const formattedValue = `$${value.toFixed(2)}`;
                    
                    // Display both PnL and actual value if available
                    if (props.payload && props.payload[0]?.payload?.actualValue !== undefined) {
                      return [
                        <>
                          <div><strong>PnL:</strong> {formattedValue}</div>
                          <div><strong>Value:</strong> ${props.payload[0].payload.actualValue.toFixed(2)}</div>
                        </>, 
                        'Portfolio'
                      ];
                    }
                    
                    return [formattedValue, 'PnL'];
                  }
                  
                  return [value, name];
                }}
                labelFormatter={(label) => `Date: ${new Date(label).toLocaleDateString()}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  borderColor: '#CBD5E0',
                  borderRadius: '4px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar
                dataKey="percentChange"
                name="Daily Change %"
                yAxisId="right"
                fill="#38A169" // Using a single color instead of a function
                radius={[2, 2, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="value"
                name="P&L"
                yAxisId="left"
                stroke="#0072B5"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
              );
            }
            
            // Default case - must return a React element, not null
            return <div></div>;
          })()}
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

// Safe number formatting helper
const safeNumber = (num: any, format: (n: number) => string, fallback: string = 'N/A'): string => {
  if (num === undefined || num === null || isNaN(num) || !isFinite(num)) {
    return fallback;
  }
  return format(num);
};

// Simple card to display key metrics
const SimpleMetricsCard: React.FC<{ metrics: any }> = ({ metrics }) => {
  if (!metrics) return null;
  
  // Extra checking to ensure reasonable values are displayed
  const isReasonableValue = (value: number): boolean => {
    return value !== undefined && value !== null && 
           isFinite(value) && !isNaN(value) && 
           Math.abs(value) < 10000; // Cap at reasonable values
  };
  
  // Filter out unreasonable metrics
  const displayAvgReturn = isReasonableValue(metrics.avgDailyReturn) && metrics.avgDailyReturn !== 0;
  const displayVolatility = isReasonableValue(metrics.volatility) && metrics.volatility > 0 && metrics.volatility < 100;
  const displaySharpe = isReasonableValue(metrics.sharpeRatio) && Math.abs(metrics.sharpeRatio) < 10;
  
  return (
    <Card 
      size="sm" 
      variant="outline" 
      mb={4} 
      bg="rgba(212, 175, 55, 0.05)" 
      borderColor="brand.copper"
      boxShadow="0 2px 4px rgba(0,0,0,0.05)"
    >
      <CardBody py={3}>
        <Flex wrap="wrap" justify="space-between">
          <Stat minWidth="120px" size="sm">
            <StatLabel 
              fontSize="xs" 
              color="brand.mahogany"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Total P&L
            </StatLabel>
            <StatNumber 
              fontSize="md" 
              fontFamily="heading"
              color="brand.navy"
            >
              ${safeNumber(metrics.absoluteChange, n => n.toFixed(2), '0.00')}
            </StatNumber>
            <StatHelpText fontSize="xs" m={0} color={metrics.percentChange >= 0 ? "brand.green" : "brand.red"}>
              <Icon 
                as={metrics.percentChange >= 0 ? TrendingUpIcon : TrendingUpIcon} 
                boxSize={3} 
                mr={1}
                transform={metrics.percentChange < 0 ? "rotate(180deg)" : "none"}
              />
              {safeNumber(metrics.percentChange, n => n.toFixed(2), '0.00')}%
            </StatHelpText>
          </Stat>
          
          {displayAvgReturn && (
            <Stat minWidth="120px" size="sm">
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Daily Return
              </StatLabel>
              <StatNumber 
                fontSize="md"
                fontFamily="heading"
                color="brand.navy"
              >
                {safeNumber(metrics.avgDailyReturn, n => n.toFixed(2), '0.00')}%
              </StatNumber>
            </Stat>
          )}
          
          {displayVolatility && (
            <Stat minWidth="120px" size="sm">
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Volatility
              </StatLabel>
              <StatNumber 
                fontSize="md"
                fontFamily="heading"
                color="brand.navy"
              >
                {safeNumber(metrics.volatility, n => n.toFixed(2), '0.00')}%
              </StatNumber>
            </Stat>
          )}
          
          <Stat minWidth="120px" size="sm">
            <StatLabel 
              fontSize="xs" 
              color="brand.mahogany"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Max Drawdown
            </StatLabel>
            <StatNumber 
              fontSize="md"
              fontFamily="heading"
              color={metrics.maxDrawdown > 10 ? "brand.red" : 
                     metrics.maxDrawdown > 5 ? "brand.copper" : "brand.navy"}
            >
              {safeNumber(metrics.maxDrawdown, n => n.toFixed(2), '0.00')}%
            </StatNumber>
          </Stat>
          
          {displaySharpe && (
            <Stat minWidth="120px" size="sm">
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Sharpe Ratio
              </StatLabel>
              <StatNumber 
                fontSize="md"
                fontFamily="heading"
                color={metrics.sharpeRatio > 1 ? "brand.green" : 
                       metrics.sharpeRatio > 0 ? "brand.navy" : "brand.red"}
              >
                {safeNumber(metrics.sharpeRatio, n => n.toFixed(2), '0.00')}
              </StatNumber>
            </Stat>
          )}
          
          <Stat minWidth="120px" size="sm">
            <StatLabel 
              fontSize="xs" 
              color="brand.mahogany"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Initial Value
            </StatLabel>
            <StatNumber 
              fontSize="md"
              fontFamily="heading"
              color="brand.navy"
            >
              ${safeNumber(metrics.startValue, n => n.toFixed(2), '0.00')}
            </StatNumber>
          </Stat>
          
          <Stat minWidth="120px" size="sm">
            <StatLabel 
              fontSize="xs" 
              color="brand.mahogany"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Current Value
            </StatLabel>
            <StatNumber 
              fontSize="md"
              fontFamily="heading"
              color="brand.navy"
            >
              ${safeNumber(metrics.endValue, n => n.toFixed(2), '0.00')}
            </StatNumber>
          </Stat>
        </Flex>
      </CardBody>
    </Card>
  );
};

export default PnLChart;