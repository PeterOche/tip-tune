#![no_std]

use soroban_sdk::contracterror;

/// Arithmetic error types for checked operations
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ArithmeticError {
    Overflow = 1,
    Underflow = 2,
    DivisionByZero = 3,
}

/// Safe arithmetic operations with explicit error handling
pub struct SafeArithmetic;

impl SafeArithmetic {
    /// Safe addition that returns error on overflow
    #[inline]
    pub fn safe_add(a: i128, b: i128) -> Result<i128, ArithmeticError> {
        a.checked_add(b).ok_or(ArithmeticError::Overflow)
    }

    /// Safe subtraction that returns error on underflow
    #[inline]
    pub fn safe_sub(a: i128, b: i128) -> Result<i128, ArithmeticError> {
        if b > a {
            return Err(ArithmeticError::Underflow);
        }
        a.checked_sub(b).ok_or(ArithmeticError::Underflow)
    }

    /// Safe multiplication that returns error on overflow
    #[inline]
    pub fn safe_mul(a: i128, b: i128) -> Result<i128, ArithmeticError> {
        a.checked_mul(b).ok_or(ArithmeticError::Overflow)
    }

    /// Safe division that returns error on divide by zero or overflow
    #[inline]
    pub fn safe_div(a: i128, b: i128) -> Result<i128, ArithmeticError> {
        if b == 0 {
            return Err(ArithmeticError::DivisionByZero);
        }
        a.checked_div(b).ok_or(ArithmeticError::Overflow)
    }

    /// Calculate percentage: (amount * numerator) / denominator
    /// Used for distributing royalties, splits, and matches
    #[inline]
    pub fn calculate_percentage(
        amount: i128,
        numerator: u32,
        denominator: u32,
    ) -> Result<i128, ArithmeticError> {
        let product = amount
            .checked_mul(numerator as i128)
            .ok_or(ArithmeticError::Overflow)?;
        product
            .checked_div(denominator as i128)
            .ok_or(ArithmeticError::Overflow)
    }

    /// Calculate and apply percentage with remainder handling
    /// Returns (calculated_amount, remainder) so no value is lost
    #[inline]
    pub fn calculate_percentage_with_remainder(
        amount: i128,
        numerator: u32,
        denominator: u32,
    ) -> Result<(i128, i128), ArithmeticError> {
        let full_result = amount
            .checked_mul(numerator as i128)
            .ok_or(ArithmeticError::Overflow)?;
        let base = full_result
            .checked_div(denominator as i128)
            .ok_or(ArithmeticError::Overflow)?;
        let remainder = full_result
            .checked_rem(denominator as i128)
            .ok_or(ArithmeticError::Overflow)?;
        Ok((base, remainder))
    }

    /// Compound addition for accumulation operations
    /// Useful for balance tracking
    #[inline]
    pub fn accumulate(current: i128, addition: i128) -> Result<i128, ArithmeticError> {
        current
            .checked_add(addition)
            .ok_or(ArithmeticError::Overflow)
    }

    /// Compound subtraction for depletion operations
    #[inline]
    pub fn deplete(current: i128, reduction: i128) -> Result<i128, ArithmeticError> {
        if reduction > current {
            return Err(ArithmeticError::Underflow);
        }
        current
            .checked_sub(reduction)
            .ok_or(ArithmeticError::Underflow)
    }

    /// Safe time arithmetic (u64) for timestamp calculations
    #[inline]
    pub fn safe_add_timestamp(base: u64, offset: u64) -> Result<u64, ArithmeticError> {
        base.checked_add(offset).ok_or(ArithmeticError::Overflow)
    }

    /// Safe counter increment (u32)
    #[inline]
    pub fn safe_increment_u32(value: u32) -> Result<u32, ArithmeticError> {
        value.checked_add(1).ok_or(ArithmeticError::Overflow)
    }

    /// Safe counter increment (u64)
    #[inline]
    pub fn safe_increment_u64(value: u64) -> Result<u64, ArithmeticError> {
        value.checked_add(1).ok_or(ArithmeticError::Overflow)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_add_normal() {
        assert_eq!(SafeArithmetic::safe_add(100, 50), Ok(150));
    }

    #[test]
    fn test_safe_add_overflow() {
        let result = SafeArithmetic::safe_add(i128::MAX, 1);
        assert_eq!(result, Err(ArithmeticError::Overflow));
    }

    #[test]
    fn test_safe_sub_normal() {
        assert_eq!(SafeArithmetic::safe_sub(100, 50), Ok(50));
    }

    #[test]
    fn test_safe_sub_underflow() {
        let result = SafeArithmetic::safe_sub(50, 100);
        assert_eq!(result, Err(ArithmeticError::Underflow));
    }

    #[test]
    fn test_safe_mul_normal() {
        assert_eq!(SafeArithmetic::safe_mul(100, 50), Ok(5000));
    }

    #[test]
    fn test_safe_mul_overflow() {
        let result = SafeArithmetic::safe_mul(i128::MAX, 2);
        assert_eq!(result, Err(ArithmeticError::Overflow));
    }

    #[test]
    fn test_safe_div_normal() {
        assert_eq!(SafeArithmetic::safe_div(100, 2), Ok(50));
    }

    #[test]
    fn test_safe_div_by_zero() {
        let result = SafeArithmetic::safe_div(100, 0);
        assert_eq!(result, Err(ArithmeticError::DivisionByZero));
    }

    #[test]
    fn test_calculate_percentage() {
        // 50% of 1000
        assert_eq!(
            SafeArithmetic::calculate_percentage(1000, 5000, 10000),
            Ok(500)
        );
    }

    #[test]
    fn test_calculate_percentage_with_remainder() {
        // 33.33% of 100 (basis points)
        let (result, remainder) =
            SafeArithmetic::calculate_percentage_with_remainder(100, 3333, 10000).unwrap();
        assert_eq!(result, 33);
        assert_eq!(remainder, 3300);
    }

    #[test]
    fn test_accumulate_overflow() {
        let result = SafeArithmetic::accumulate(i128::MAX, 1);
        assert_eq!(result, Err(ArithmeticError::Overflow));
    }

    #[test]
    fn test_deplete_underflow() {
        let result = SafeArithmetic::deplete(50, 100);
        assert_eq!(result, Err(ArithmeticError::Underflow));
    }

    #[test]
    fn test_safe_add_timestamp() {
        assert_eq!(SafeArithmetic::safe_add_timestamp(1000, 500), Ok(1500));
    }

    #[test]
    fn test_safe_increment_u32() {
        assert_eq!(SafeArithmetic::safe_increment_u32(100), Ok(101));
        let result = SafeArithmetic::safe_increment_u32(u32::MAX);
        assert_eq!(result, Err(ArithmeticError::Overflow));
    }
}
